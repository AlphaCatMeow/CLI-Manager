# 终端工具栏「实时统计 / Git 变更」按钮显隐开关

## Goal

在「设置 → 通用设置 → 工具栏 → 终端工具栏」区块新增两个开关，允许用户控制终端标签栏右侧工具栏的「实时统计」按钮（`BarChart3`）与「Git 变更」按钮（`GitBranch`）的显示/隐藏。两者默认显示。

## What I already know

* **按钮位置**：`src/components/TerminalTabs.tsx`
  - Git 变更按钮：第 1336-1350 行（`handleToggleGitChangesPanel` / `GitBranch` 图标 / 文案「Git 变更」）。
  - 实时统计按钮：第 1351-1365 行（`handleToggleStatsPanel` / `BarChart3` 图标 / 文案「统计」）。
  - 两者目前**无条件渲染**，未接任何显隐开关。
  - 工具栏整体在一个 `useMemo` 内，依赖数组在第 1367-1381 行。
* **工具栏显隐配置**：`src/stores/settingsStore.ts`
  - `TerminalToolbarVisibilitySettings`（第 61-67 行）当前字段：`templates`、`commandHistory`、`fullscreen`、`sessionHistory`、`showText`。
  - `DEFAULTS.terminalToolbarVisibility`（第 204-210 行）。
  - `migrateTerminalToolbarVisibility`（第 294-308 行）逐字段回退。
* **设置 UI**：`src/components/settings/pages/GeneralSettingsPage.tsx`
  - `TERMINAL_TOOLBAR_OPTIONS`（第 179-184 行）数组 + `TerminalToolbarOptionKey` 类型（第 186 行，`Exclude<keyof TerminalToolbarVisibilitySettings, "showText">`）。
  - 「终端工具栏」开关由该数组 `.map` 自动渲染（第 812-828 行），加数组项即出现开关。
* **孤儿字段**：`SidebarToolbarVisibilitySettings.gitChanges`（`settingsStore.ts` 第 69-72 行）已定义、默认 `true`、有迁移逻辑（第 310-321 行），但**全代码库无任何使用点**。`sidebarToolbarVisibility.stats` 控制的是侧边栏底部「历史用量统计」按钮（`SidebarFooter.tsx:14`），与本需求无关，保留。

## Requirements

* [ ] `TerminalToolbarVisibilitySettings` 接口新增 `stats: boolean`、`gitChanges: boolean`，默认 `true`。
* [ ] `DEFAULTS.terminalToolbarVisibility` 新增 `stats: true`、`gitChanges: true`。
* [ ] `migrateTerminalToolbarVisibility` 补 `stats`、`gitChanges` 两字段的兼容读取（缺失回退 `true`）。
* [ ] `TERMINAL_TOOLBAR_OPTIONS` 新增 `{ key: "stats", label: "实时统计" }`、`{ key: "gitChanges", label: "Git 变更" }`。
* [ ] `TerminalTabs.tsx` 的实时统计按钮包 `terminalToolbarVisibility.stats &&`，Git 变更按钮包 `terminalToolbarVisibility.gitChanges &&`；`useMemo` 依赖数组补这两项。
* [ ] 删除孤儿字段 `SidebarToolbarVisibilitySettings.gitChanges`：接口定义、`DEFAULTS.sidebarToolbarVisibility.gitChanges`、`migrateSidebarToolbarVisibility` 三处一并移除；保留 `stats`。

## Acceptance Criteria

* [ ] 设置页「终端工具栏」区块新增「实时统计」「Git 变更」两个开关，默认开启。
* [ ] 关闭某开关后，对应 tab 栏右侧按钮立即隐藏；再次开启立即恢复。
* [ ] 设置持久化到 `tauri-plugin-store`，重启生效。
* [ ] 图标模式与图标+文字模式下样式均一致。
* [ ] 老用户配置缺失这两字段时回退默认 `true`，现有行为不变。
* [ ] 类型检查、lint 通过。

## Out of Scope (explicit)

* 不改动 `TerminalStatsPanel` / `GitChangesPanel` 面板内部功能。
* 不改动其他终端工具栏按钮（templates/commandHistory/fullscreen/sessionHistory/showText）逻辑。
* 不改动侧边栏底部「历史用量统计」按钮（`sidebarToolbarVisibility.stats`）。

## Technical Notes

* 文件：
  - `src/stores/settingsStore.ts` — 扩展 `TerminalToolbarVisibilitySettings` + 默认值 + 迁移；删除 `SidebarToolbarVisibilitySettings.gitChanges` 三处。
  - `src/components/settings/pages/GeneralSettingsPage.tsx` — 扩展 `TERMINAL_TOOLBAR_OPTIONS`（`TerminalToolbarOptionKey` 会自动包含新 key）。
  - `src/components/TerminalTabs.tsx` — 两按钮条件渲染 + useMemo 依赖。
* 参考既有字段 `templates`/`fullscreen` 的写法，保持一致。
* 重叠任务提醒：`06-15-add-stats-panel-button-visibility-toggle`（planning，未落地）规划过 `stats` 开关；本任务范围已覆盖并扩展，旧任务可后续归档。
