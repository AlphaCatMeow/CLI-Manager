# recover-stashed-lost-code

## Goal

恢复最新 IDEA Shelf（2026-06-16 23:07）里的业务代码，避免把已丢失的功能继续遗漏，同时跳过无关的 `.trellis` 任务文件删除和非代码变更。

## What I already know

* 用户确认要合并最新 Shelf 的业务代码。
* `git stash` 只有 `bash.exe.stackdump` 变更，不是业务代码。
* 最新 IDEA Shelf 文件：`.idea/shelf/在进行更新之前于_2026-06-16_23_07_取消提交了更改_[更改]/shelved.patch`。
* 该 Shelf 涉及 Git diff 输出、Git 新增筛选、折叠侧边栏 group flyout、终端工具栏 Git/统计可见性等。
* 直接 `git apply --check --3way` 失败：包含 `.trellis` 删除，且 `settingsStore.ts`、`TerminalTabs.tsx`、`GeneralSettingsPage.tsx` 与当前代码冲突。

## Requirements

* 只恢复业务代码，不应用 `.trellis/tasks/06-15-fix-claude-code-ime-drift/*` 删除。
* 手动合并冲突，保留当前已存在的新代码（如 `terminalToolbarOrder`）。
* 恢复 Git 新增筛选：`A` 筛选应包含已暂存新增、未跟踪 `U/??`。
* 恢复 Git diff patch 输出格式修复。
* 恢复折叠侧边栏：顶层 group 显示数量徽标，hover 弹出 group flyout，点击 group 展开侧边栏。
* 恢复终端工具栏：Git 变更使用 Git 图标，并可在设置里显示/隐藏；统计标签按项目命名为“实时统计”。

## Acceptance Criteria

* [ ] `.trellis` 删除不被合并。
* [ ] `npx tsc --noEmit` 通过。
* [ ] `cd src-tauri && cargo check` 通过。
* [ ] Git 变更面板选择“新增”时包含未跟踪文件。
* [ ] 折叠侧边栏 group hover flyout 可查看/打开组内项目。
* [ ] 设置页可控制终端工具栏的“Git 变更”和“实时统计”按钮。

## Definition of Done

* 静态检查通过。
* Rust 检查通过。
* UI 运行态列出人工验收项，不由 AI 启动桌面应用验收。

## Technical Approach

手动把最新 Shelf 中的业务 diff 按文件合并到当前代码：对当前已演进的文件只补缺失逻辑，不整块覆盖。

## Decision (ADR-lite)

**Context**: 最新 Shelf 不能直接应用，整包 apply 会删除 Trellis 任务文件且覆盖当前新代码。

**Decision**: 采用手动最小合并：跳过 `.trellis` 删除，只恢复业务代码，并保留当前已存在的 `terminalToolbarOrder` 等新逻辑。

**Consequences**: 合并更安全，但需要运行 typecheck/cargo check，并由人工验证桌面 UI。

## Out of Scope

* 不合并更早 Shelf（06-03、06-08、06-11）。
* 不处理 `bash.exe.stackdump` stash。
* 不重构侧边栏/工具栏架构。
* 不提交、不 push。

## Technical Notes

* Trellis specs read: frontend component/state/quality guidelines, backend index, shared code reuse/cross-layer guides.
* GitNexus impact:
  * `ProjectTree` LOW，0 impacted。
  * `Sidebar` LOW，0 impacted。
  * `TerminalTabs` LOW，0 impacted。
  * `GeneralSettingsPage` LOW，0 impacted。
  * `format_diff_to_text` / `git_get_file_diff` / `useGitStore` 未被当前 GitNexus 索引命中；已通过直接读取文件确认局部变更。
