# worktree-tab-use-task-name

## Goal

Worktree 终端 Tab 仅显示 Worktree 任务名，减少重复的项目名前缀，让标题更简洁。

## Requirements

- 新建、打开、分屏 Worktree 终端时，Tab 标题使用 `worktree.name`。
- 从历史会话恢复 Worktree 终端时，Tab 标题使用 `worktree.name`。
- Worktree 范围内新建终端时，Tab 标题使用 `worktree.name`。
- 普通项目终端标题规则保持不变。
- Worktree 的路径、分支、会话绑定及 `WT` 标识保持不变。

## Acceptance Criteria

- [x] 所有主要入口创建的 Worktree Tab 仅显示任务名。
- [x] 普通项目 Tab 仍显示项目名。
- [x] TypeScript 类型检查通过。
- [x] GitNexus 已识别本任务涉及的 Sidebar、HistoryWorkspace、TerminalTabs 命名符号；工作区总体高风险来自其他未提交改动。

## Technical Approach

将现有的 ``${project.name} · ${worktree.name}`` 替换为 `worktree.name`，不引入新抽象或配置。

## Out of Scope

- 不修改 Worktree 任务名生成和校验规则。
- 不修改侧边栏 Worktree 节点名称。
- 不修改非 Worktree Tab 的命名规则。

## Changelog Target

`[TEMP]`

## Technical Notes

- 预计涉及 `src/components/sidebar/index.tsx`、`src/components/HistoryWorkspace.tsx`、`src/components/TerminalTabs.tsx`。
- 用户已确认实施方案。
