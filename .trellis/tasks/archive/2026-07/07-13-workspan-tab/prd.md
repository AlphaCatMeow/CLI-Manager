# 修复 Workspan Tab 交互并增加下拉列表

## Goal

修复 Workspan 顶层 Tab 无法右键、Tab 过多时显示原生横向滚动条的问题，并增加类似 IDEA 的 Tab 下拉列表，方便快速切换和关闭工作区。

## Requirements

- Workspan Tab 支持右键菜单。
- 单会话 Workspan 支持重命名和关闭；多会话 Workspan 仅提供安全的工作区级关闭操作。
- Workspan Tab 过多时保留横向滚动能力，但不显示原生滚动条。
- Tab 栏右侧提供下拉按钮，展示全部 Workspan Tab。
- 下拉列表显示当前选中项，支持点击切换，并支持逐项关闭。
- 无论通过下拉列表、快捷键或其他入口切换 Workspan，当前激活 Tab 都会自动滚入 Tab 栏可视区域。
- 用户可见文案同时支持 `zh-CN` 和 `en-US`。
- Changelog Target: `[TEMP]`。

## Acceptance Criteria

- [ ] 右键任意 Workspan Tab 能打开菜单。
- [ ] 菜单操作与 Workspan 类型匹配，不对多会话 Workspan 提供无效重命名。
- [ ] Tab 溢出时不显示横向滚动条，鼠标滚轮或触控板仍可横向浏览。
- [ ] 下拉按钮能展示所有 Workspan Tab，当前项有选中状态。
- [ ] 点击列表项可切换 Workspan，点击关闭按钮可关闭对应 Workspan。
- [ ] 切换到溢出区域中的 Workspan 后，其激活 Tab 自动出现在 Tab 栏可视区域，Tab 顺序和栏位布局不变。
- [ ] 拖拽排序、双击重命名、现有关闭确认逻辑保持有效。
- [ ] TypeScript 类型检查通过。

## Definition of Done

- 完成最小实现和静态检查。
- 更新 `CHANGELOG.md` 的 `[TEMP]` 版本记录。
- 如功能清单存在对应模块，补充 `docs/功能清单.md`。

## Technical Approach

- 复用现有 Radix `ContextMenu`、`Popover` 和 Workspan 关闭逻辑，不引入依赖。
- 在 `SortableWorkspanTab` 内增加右键菜单，并由父组件传入工作区级操作。
- 为 Workspan Tab 容器复用无可见滚动条样式，并增加固定在右侧的下拉入口。
- 下拉列表复用现有终端 Tab 列表视觉样式和交互模式。

## Decision (ADR-lite)

**Context**: Workspan 顶层 Tab 替代了部分旧终端 Tab 交互，但未同步右键菜单和溢出导航。

**Decision**: 在现有单文件组件结构中补齐交互，复用项目已有菜单与弹层组件，不抽象新层级。

**Consequences**: 改动集中、风险较低；多会话 Workspan 的菜单仅保留不会产生歧义的操作。

## Out of Scope

- 不重构 Workspan 数据模型。
- 不新增依赖。
- 不改变 Tab 拖拽排序和分屏数据结构。

## Technical Notes

- 主要文件：`src/components/TerminalTabs.tsx`、`src/styles/components.css`、`src/lib/i18n.ts`。
- `SortableWorkspanTab` 当前没有 `ContextMenu` 包装。
- `.ui-workspan-tabbar` 当前使用 `overflow-x-auto`，受全局滚动条样式影响。
- GitNexus 索引刷新因 `.gitnexus/lbug` 访问被拒绝而失败；现有索引落后一个提交，源码检查已确认问题位置。
