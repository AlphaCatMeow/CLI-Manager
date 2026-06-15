# add-copy-button-terminal-tab-menu

## Goal

在内部窗口终端 Tab 的右键菜单中，在“新建终端”下方增加“复制”菜单项，让用户可以从当前 Tab 快速创建一个同配置的新终端 Tab，减少重复选择项目/路径/启动参数的操作。

## What I already know

* 用户要求：在内部窗口终端 Tab 右键菜单中，在“新建终端”下方增加“复制”按钮。
* 终端 Tab 右键菜单位于 `src/components/TerminalTabs.tsx` 的 `PaneTabBar` → `SortableTab` 的 `menuContent`，当前顺序包含“关闭终端 / 关闭其它终端 / 关闭左侧终端 / 关闭右侧终端 / 新建终端”。
* 内部终端创建能力来自 `useTerminalStore().createSession(projectId, cwd, title, startupCmd, envVars, shell)`，会创建 PTY、保存 session，并在存在 `startupCmd` 时写入启动命令。
* `TerminalSession` 已保存复制所需的 `projectId`、`title`、`cwd`、`shell`、`envVars`、`startupCmd` 字段。
* 终端内容区域 `XTermTerminal.tsx` 已有文本选区复制能力和终端内容右键菜单；本任务目标是 Tab 右键菜单。

## Assumptions (temporary)

* “复制”指复制/克隆当前终端 Tab：新建一个同配置会话，而不是把 Tab 标题或终端文本写入剪贴板。
* 复制后新 Tab 应自动成为活跃 Tab，并进入终端工作区（沿用 `createSession` 默认行为）。
* 复制会话会沿用当前 Tab 的启动命令；如果原 Tab 是项目终端，会再次启动同一 CLI/命令。

## Open Questions

* 已确认：“复制”语义为复制当前终端 Tab（同配置新会话）。

## Requirements (evolving)

* 在内部终端 Tab 右键菜单中，将“复制”放在“新建终端”下方。
* 点击“复制”时，在同一内部终端区新建一个终端 Tab。
* 新 Tab 继承被右键 Tab 的 `projectId`、`cwd`、`startupCmd`、`envVars`、`shell` 与标题。
* 菜单项作用于被右键点击的 Tab，而不是当前全局活跃 Tab。
* 不改动终端内容区域的文本复制逻辑。

## Acceptance Criteria (evolving)

* [ ] 右键内部终端 Tab 时，“新建终端”下方显示“复制”。
* [ ] 点击“复制”后创建一个新的内部终端 Tab。
* [ ] 新 Tab 继承被右键 Tab 的 `projectId`、`cwd`、`startupCmd`、`envVars`、`shell` 与标题。
* [ ] 现有关闭、新建、背景图、分屏相关菜单行为不受影响。
* [ ] TypeScript 类型检查通过或明确说明未运行原因。

## Definition of Done (team quality bar)

* Tests added/updated where appropriate for changed logic.
* Lint / typecheck / CI green when run.
* Docs/notes updated if behavior changes.
* Rollout/rollback considered if risky.

## Out of Scope (explicit)

* 不新增快捷键或命令面板入口。
* 不改变终端正文右键菜单的“复制选区”行为。
* 不实现跨外部终端窗口复制。
* 不改变项目配置复制/克隆逻辑。

## Technical Notes

* Likely files: `src/components/TerminalTabs.tsx`; possibly no store changes needed if直接复用 `createSession`。
* Existing Tab context menu uses `ContextMenuItem` from `src/components/ui/context-menu.tsx`.
* Existing terminal content copy helper is local to `XTermTerminal.tsx`; do not conflate with Tab duplication.
* Before editing `TerminalTabs.tsx` symbols, project instructions require GitNexus impact analysis. GitNexus MCP tools are not currently exposed in this tool list, so use the available GitNexus skill/CLI path before code edits if possible.
