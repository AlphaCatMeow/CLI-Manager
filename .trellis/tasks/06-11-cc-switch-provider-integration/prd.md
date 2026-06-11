# cc-switch 供应商集成 — Phase 1：解析与展示

## 背景

用户使用 cc-switch（https://ccswitch.io）管理多个 Claude/Codex/Gemini API 供应商，其数据存于
`%USERPROFILE%\.cc-switch\cc-switch.db`（SQLite）。最终目标是在 CLI-Manager 中对 CLI 为 claude
的项目支持右键切换供应商（改写 `<project>\.claude\settings.json` 的 `env` 段）。

本任务为第一阶段：**只做解析与展示**，在设置中新增"供应商"页，读取 cc-switch.db 并展示供应商列表。

## 范围（本阶段）

1. **后端**：新增 Tauri 命令 `ccswitch_list_providers(dbPath?: string)`
   - 默认路径 `~/.cc-switch/cc-switch.db`，可由前端传入自定义路径
   - 以**只读**方式打开 SQLite（复用依赖树中已有的 sqlx 0.8，不新增原生依赖）
   - 查询 `providers` 表，解析 `settings_config` JSON / `meta` JSON
   - **密钥脱敏在 Rust 侧完成**：env 中 key 名含 token/key/secret/auth/password 的值只返回掩码
   - 稳定错误字符串：`db_not_found` / `unsupported_format` / `db_open_failed` / `db_query_failed`
2. **前端**：
   - `settingsStore` 新增持久化字段 `ccSwitchDbPath: string | null`（null = 默认路径）
   - `SettingsModal` 新增 Tab `providers`（label：供应商），支持搜索过滤
   - 新页面 `ProviderSettingsPage`：db 路径展示/选择（plugin-dialog）/重置/刷新；
     按 app_type 分组筛选（默认 claude）；供应商卡片展示 name、当前标记、category、
     BASE_URL、模型、脱敏 env 明细（可展开）

## 不在本阶段范围

- 项目右键菜单与按项目切换供应商
- 写入/改写 `<project>\.claude\settings.json`
- cc-switch 代理、健康检查、用量等其余表数据

## 验收标准

- 设置 → 供应商：能列出 cc-switch.db 中全部供应商，claude 为默认筛选，`is_current` 有"当前"标记
- 自定义 db 路径可持久化，重启后生效；路径无效时给出友好错误且不崩溃
- 前端收到的任何 env 值中不含完整密钥（Rust 侧脱敏）
- 打开 db 为只读模式，不会创建/修改文件
- `npx tsc --noEmit` 与 `cd src-tauri && cargo check` 通过

## 技术要点

- sqlx 0.8.6 已由 tauri-plugin-sql 引入依赖树，显式声明 `default-features = false,
  features = ["runtime-tokio", "sqlite"]` 即可，无 libsqlite3-sys 版本冲突
- `SqliteConnectOptions::new().filename(path).read_only(true)`（create_if_missing 默认 false）
- db 实际表结构见 research/cc-switch-db-schema.md

---

# Phase 2：按项目切换供应商（2026-06-11 启动）

## 需求

CLI 为 claude 的项目，在侧栏右键菜单中选择供应商，把所选供应商的 env
（ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN / 模型映射等）写入
`<project>\.claude\settings.json`，实现按项目切换 API 供应商。

## 后端（扩展 src-tauri/src/commands/ccswitch.rs）

1. `ccswitch_get_project_provider(project_path, db_path?)` —— 探测项目当前供应商
   - 读 `<project>/.claude/settings.json`（不存在 → `hasSettingsFile: false`）
   - 与 db 中 app_type='claude' 的各 provider 比对：`env.ANTHROPIC_BASE_URL` 相等
     且（`ANTHROPIC_AUTH_TOKEN` 或 `ANTHROPIC_API_KEY`）相等 → 匹配
   - 返回 `{ matchedProviderId: string|null, hasSettingsFile: bool, baseUrl: string|null }`
   - 比对在 Rust 侧完成，明文 token 不出后端
2. `ccswitch_apply_provider(project_path, provider_id, db_path?)` —— 执行切换
   - 校验：project_path 必须是已存在目录（`project_not_found`）；provider 必须存在于
     db 且 app_type='claude'（`provider_not_found`）
   - 读项目 settings.json：不存在视为 `{}`；存在但解析失败 → `settings_parse_failed`，**不动文件**
   - env 替换规则（核心，需单测）：
     a. 移除现有 env 中所有 `ANTHROPIC_` 前缀的 key（清掉上一家供应商遗留）
     b. 将 provider `settings_config.env` 的**全部** key 覆盖写入
     c. env 之外的顶层字段（hooks/permissions/...）一律不动；只取 provider 的 env 段，
        不取 provider 的 hooks 等其他字段
   - `create_dir_all(<project>/.claude)`；原子写（同目录临时文件 + rename 覆盖），
     pretty JSON（2 空格）
   - 返回 unit；任何 env 内容（含明文 token）不返回给前端
   - 写失败 → `settings_write_failed: ...`

## 前端

1. `src/components/sidebar/index.tsx` 项目右键菜单：当 `project.cli_tool` 包含
   "claude"（忽略大小写）时显示"切换供应商"菜单项（lucide 图标，风格与现有项一致），
   点击关闭菜单并打开切换弹层
2. 新组件 `src/components/ProviderSwitchModal.tsx`（挂载方式与 sidebar 现有 modal 一致）：
   - 打开时并行调 `ccswitch_list_providers`（筛 app_type=claude）与
     `ccswitch_get_project_provider`
   - 列表：name / BASE_URL / category，当前匹配项打勾高亮
   - 点击即切换：`ccswitch_apply_provider` → 成功 toast（提示"新开终端生效"）→ 刷新匹配态
   - 错误码映射为中文提示（project_not_found / provider_not_found /
     settings_parse_failed / settings_write_failed / db_not_found）

## 验收标准（Phase 2）

- claude 项目右键出现"切换供应商"；cli_tool 为 codex/空的项目不出现
- 切换后 settings.json：ANTHROPIC_* 全部来自新供应商；用户自有非 ANTHROPIC_ env key
  保留；hooks 等其余顶层字段保持原样
- `.claude/` 或 settings.json 不存在时自动创建
- settings.json 为损坏 JSON 时报错且文件原样不动
- 明文 token 仅在 Rust 侧流转，永不进 WebView
- Rust 单测覆盖 env 替换规则（遗留清理/保留用户 key/顶层字段不动/损坏 JSON）
- `npx tsc --noEmit`、`cd src-tauri && cargo check`、`cargo test ccswitch` 通过
