# Git Status Contracts

> git.rs 中 Git 状态收集/变更列表的执行合约与已知陷阱。

---

## 状态收集的三条链路（改过滤逻辑必须全部检查）

| 链路 | 入口 | 消费方 | 收集方式 |
|------|------|--------|----------|
| Git 面板 | `git_get_changes`（Tauri command） | `gitStore.fetchChanges` / `fileExplorerStore` | **内联 status 循环**（git.rs 内 `for entry in statuses.iter()`） |
| Replay 快照 | `git_get_worktree_snapshot` → `build_worktree_snapshot` | `replayStore` | `collect_git_changes_from_repo()` |
| WSL 项目 | `git_get_changes` → `git_get_changes_wsl` | 同面板 | `git status --porcelain -z` 文本解析（`parse_wsl_git_status`） |

> **Warning**: `git_get_changes` 与 `collect_git_changes_from_repo` 是两段**重复实现**的收集循环，历史原因未合并。任何条目过滤/状态映射规则变更必须同步两处（优先提取共享函数），WSL 文本解析链路也要评估是否同样适用。

### Common Mistake: 只改 `collect_git_changes_from_repo` 导致面板无效果

**Symptom**：修复/过滤逻辑单测全绿，但 Git 面板 UI 行为不变。

**Cause**：面板真正调用的是 `git_get_changes` 的内联循环，不经过 `collect_git_changes_from_repo`（后者只服务 Replay 快照）。issue #85 首轮修复即踩此坑。

**Fix / Prevention**：过滤类逻辑提取为共享工具函数（现有范例：`is_nested_repo_entry`），两个循环各自调用；修改前 grep `statuses.iter()` 确认所有循环点。

---

## 嵌套 Git 子仓库过滤合约（issue #85）

### Signatures

```rust
/// 尾部 '/' 且目录内存在 .git（目录或文件形式，覆盖 submodule/worktree gitlink）→ true
fn is_nested_repo_entry(repo: &Repository, file_path: &str) -> bool
```

### Contracts

- libgit2 `statuses()` + `recurse_untracked_dirs(true)` 下：普通未跟踪目录会被展开为文件条目；**只有嵌套 git 仓库**保留为带尾部 `/` 的目录条目（如 `sub-repo-a/`）。
- 命中 `is_nested_repo_entry` 的条目：`continue` 跳过，不进入 `GitFileChange` 列表。
- `git_get_file_diff` 的 `"U" | "??"` 分支：`read_to_string` 前有 `is_dir()` 兜底守卫，目录条目返回友好中文错误，而非原始 OS 错误（Windows 下曾表现为 os error 123/5/3，随环境浮动）。

### Validation & Error Matrix

| 条件 | 行为 |
|------|------|
| 条目尾部 `/` 且 `<dir>/.git` 存在 | 跳过，不进变更列表 |
| 条目尾部 `/` 但无 `.git`（理论不出现） | 保留，不误伤 |
| diff 请求路径为目录 | `Err("该条目是目录（可能为嵌套 Git 仓库），无法显示文件 diff")` |

### Tests

- `commands::git::tests::collect_git_changes_skips_nested_repo_dir`（正例 + 反例）
- `commands::git::tests::is_nested_repo_entry_detects_nested_repo_dir_only`
- 手工夹具：`D:\github\nested-git-test`（一级/二级嵌套仓库 + node_modules 假 .git）

### 已知未覆盖（后续项）

- `parse_wsl_git_status`（WSL 链路）尚未过滤嵌套仓库条目（`?? dir/` 仍会进列表；diff 目录守卫可兜底不报错）。已记入任务 `07-05-feat-git-sub-repo-monitor` 一并处理。

---

## Git 分支菜单命令合约（V1.2.6）

### 1. Scope / Trigger

- Trigger: Git 变更面板新增分支列表、Fetch、checkout、本地新建分支能力，跨越 Tauri command、Rust Git 执行、Zustand store、React UI 和 i18n。
- Target: `src-tauri/src/commands/git.rs` 中 Git 面板相关命令；前端只通过 Tauri command 调用，不拼接 shell 命令。

### 2. Signatures

```rust
pub struct GitBranchInfo {
    pub name: String,
    pub branch_type: String, // "local" | "remote"
    pub current: bool,
    pub upstream: Option<String>,
    pub remote: Option<String>,
}

#[tauri::command]
pub async fn git_list_branches(project_path: String) -> Result<Vec<GitBranchInfo>, String>;

#[tauri::command]
pub async fn git_fetch(project_path: String) -> Result<String, String>;

#[tauri::command]
pub async fn git_checkout_branch(
    project_path: String,
    branch: String,
    remote: bool,
) -> Result<String, String>;

#[tauri::command]
pub async fn git_create_branch(project_path: String, branch: String) -> Result<String, String>;
```

### 3. Contracts

- `project_path` 是当前 Git 面板生效仓库路径：根仓库或已选子仓库。非仓库返回 `open_repo_failed:*` 或 Git 原始错误映射。
- `git_list_branches` 只读本地 Git 元数据，不触网；本地分支带 `current/upstream`，远程分支跳过 `*/HEAD`。
- `git_fetch` 执行 `git fetch --prune`，只刷新远端 refs，不 merge/rebase，不修改工作区文件。
- `git_checkout_branch(remote=false)` 执行 `git checkout <branch>`，不使用 force。
- `git_checkout_branch(remote=true)` 要求分支形如 `<remote>/<name>`，执行 `git checkout --track <remote>/<name>`。
- `git_create_branch` 执行 `git checkout -b <branch>`，从当前 HEAD 创建并切换。
- checkout/create 成功后前端必须刷新 changes、branch status、branch list 和 repository list；失败后至少刷新 changes、branch status、branch list，避免 UI 停留在半旧状态。

### 4. Validation & Error Matrix

| 条件 | 行为 |
|------|------|
| `branch` 为空 | `empty_branch` |
| `branch` 以 `-` 开头、含空白/control、`..`、`//`、`@{`、以 `/` 或 `.` 结尾、或含 `~`、`^`、`:`、`?`、`*`、`[`、反斜杠 | `invalid_branch` |
| `git check-ref-format --branch <branch>` 失败 | `invalid_branch` |
| `remote=true` 但分支没有 `<remote>/<name>` 结构 | `invalid_branch` |
| checkout 会覆盖本地改动 | `checkout_conflict`，不强制切换 |
| git 可执行文件不存在 | `git_not_found` |
| remote 不存在或不可访问 | `no_remote` 或 Git 原始错误映射 |

### 5. Good/Base/Bad Cases

- Good: 面板打开时读取分支列表；用户点击本地分支，后端普通 checkout，成功后 UI 当前分支与变更列表刷新。
- Good: 用户先 Fetch，再 checkout `origin/feature/x`，Git 创建本地跟踪分支并切换。
- Base: 没有远程分支时远程区显示空状态；Fetch 失败只提示错误，不影响已有工作区。
- Bad: 前端用字符串拼接执行 `git checkout ${branch}`。
- Bad: checkout 失败后仍显示目标分支为当前分支。
- Bad: 为了模拟 JetBrains Smart Checkout 在 Stage A 自动 stash 或强制 checkout。

### 6. Tests Required

- Rust 单测：合法分支名通过；空、`-bad`、空白、`..`、`:`、`\`、尾部 `/` 等非法分支名返回预期错误码。
- TypeScript：`npx tsc --noEmit` 验证 `GitBranchInfo` 与 i18n key 完整。
- Rust：`cargo check` 验证 Tauri command 注册和 Git 命令编译。
- 手动：Fetch 不修改 `git status --short`；本地 checkout 成功刷新；远程 checkout 建立 upstream；checkout 冲突时当前分支和文件内容不变。

### 7. Wrong vs Correct

#### Wrong

```typescript
// 前端不要直接拼命令，也不要绕过后端校验。
await invoke("run_shell", { command: `git checkout ${branch}` });
```

#### Correct

```typescript
await invoke("git_checkout_branch", {
  projectPath,
  branch: item.name,
  remote: item.branchType === "remote",
});
```
