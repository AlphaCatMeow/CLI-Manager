# 折叠侧边栏项目树重设计：分组优先 + 悬浮浮层

## Goal

修复左侧项目树折叠态（60px）显示混乱的问题。当前折叠后把整棵树所有层级的所有节点竖排平铺成"首字按钮"，行数等于全部分组+项目数，又长又无法识别（中文项目显示"停/启/云/创/零/知"等无意义首字，分组全是雷同 Folder 图标）。

改为「分组优先 + 悬浮浮层」：折叠态只竖排显示**顶层分组图标**（带项目数角标）与**未分组顶层项目**（状态点/首字）；hover/点击分组弹出该组项目列表浮层，点项目即打开终端。

## What I already know（诊断）

折叠态渲染逻辑全部集中在 `src/components/sidebar/ProjectTree.tsx:334-406`：

* `flattenTree` (`ProjectTree.tsx:97-119`)：无条件递归 `node.children`，**完全忽略 `collapsedIds`** → 折叠侧边栏后把所有分组下所有项目全量平铺，连用户已折叠的分组也展开。
* `ProjectTree.tsx:383`：`project.name.trim().charAt(0).toUpperCase()` 取首字。中文 `toUpperCase()` 无效，多个同首字项目（两个"云…"）无法区分，纯汉字不像图标。
* `ProjectTree.tsx:366-377`：所有分组渲染同一个 `Folder` 图标，"其他/CLI-Manager/工作"视觉雷同，无法辨识。

头部 / 搜索 / 底部三个工具栏区（`SidebarHeader` / `SidebarSearch` / `SidebarFooter`）的折叠态是干净的竖排图标，**本次不改**。

## Research Notes

### 现成可复用基础设施

* `src/components/ui/popover.tsx`：基于 `@radix-ui/react-popover` 的封装，自带 Portal、`side/align/sideOffset` 定位、碰撞规避、open 动画、`ui-glass` 毛玻璃样式。支持受控（`open` + `onOpenChange`）。
* `src/components/ui/Portal.tsx` + `sidebar/index.tsx` 的 contextMenu：已验证的"绝对定位 + Portal + 点击外部关闭"模式，可作为浮层定位/关闭逻辑参考。
* 折叠态已有 `useVirtualizer`（`collapsedRowVirtualizer`）；改为只显示顶层分组后，顶层数量通常为个位数，虚拟滚动非必需（可保留可移除）。

### 类似工具惯例

* VS Code Activity Bar 折叠态：竖排图标，hover 弹出二级浮层菜单；点击切换/展开。
* 各类 IDE 折叠侧栏：折叠态只显示顶层容器图标 + 悬浮二级列表，不平铺全部叶子节点。

## Open Questions

*（已收敛，见 Decision）*

## Requirements (evolving)

* 折叠态项目树只渲染**顶层节点**：顶层分组（图标 + 项目数角标） + 顶层未分组项目（状态色点，无会话时回退首字/Terminal 图标）。
* 折叠态宽度约 64px（较现 60px 略增），分组图标 + 数量角标做舒展清晰，避免拥挤观感；混乱感由"只显示顶层、层级收进浮层"根除，而非靠加宽。
* 顶层分组下的项目**不再平铺**到折叠栏主体。
* **浮层触发**：hover 悬停分组图标即弹出该组浮层；鼠标移出图标与浮层后延迟（~150ms）关闭，避免抖动。
* **点击分组图标**：展开整个侧边栏（`expandSidebar`），并确保该分组在展开态为打开状态、定位到该组。
* 分组浮层：列出该分组完整子树（子分组 + 项目，迷你版展开态），点项目 = 打开终端，右键 = 复用现有 contextMenu。
* 顶层未分组项目：点击 = 打开终端，右键 = contextMenu（与展开态一致）。
* 分组图标可辨识：至少带项目数角标；浮层标题显示分组名。
* 复用 `ui/popover.tsx`（Radix），不自造浮层。

## Acceptance Criteria (evolving)

* [ ] 折叠态不再竖排显示所有项目首字；主体只剩顶层分组图标 + 顶层未分组项目。
* [ ] hover 分组图标弹出浮层，浮层内可见该组项目并能点击打开终端；移出后浮层自动关闭。
* [ ] 点击分组图标展开整个侧边栏，并展开/定位到对应分组。
* [ ] 中文/英文项目在折叠态都能被识别（靠分组归属 + 浮层名称，不再依赖单字）。
* [ ] 折叠态与展开态的右键菜单、打开终端行为一致。
* [ ] `npx tsc --noEmit` 通过；运行态 UI 由人工验收。

## Definition of Done

* TypeScript 类型检查 / lint 通过。
* 折叠 ↔ 展开切换、分组浮层、打开终端、右键菜单经人工验收。
* 不破坏现有展开态项目树、拖拽、键盘导航。

## Decision (ADR-lite)

**Context**：折叠态 60px 需要在"快速识别/导航"与"不堆砌叶子节点"之间平衡；触发方式决定整体交互骨架。

**Decision**：采用方案 B（分组优先 + 悬浮浮层）；交互取 A —— hover 悬停分组图标弹出该组浮层，点击分组图标展开整个侧边栏并定位到该组。浮层复用 `ui/popover.tsx`（Radix 受控）。

**Consequences**：贴近 VS Code Activity Bar 直觉；需处理 hover 进入/离开延迟避免闪烁；点击展开需跨"折叠→展开"状态定位（MVP 至少保证 `expandSidebar` + 该组 open，滚动到位尽力而为）。

## Out of Scope

* 头部 / 搜索 / 底部工具栏折叠态（保持现状）。
* 展开态项目树的任何行为。
* 折叠/展开宽度记忆、自动折叠断点等既有逻辑。

## Technical Notes

* 仅改 `src/components/sidebar/ProjectTree.tsx` 折叠分支（334-406）及相关 flatten helper；可能新增一个浮层子组件（如 `CollapsedGroupFlyout`）。
* `flattenTree` 改为只取顶层节点（或新增 `topLevelNodes` 派生）。
* 浮层内项目列表可复用 `TreeNodeItem` 或精简渲染。
* 状态点颜色沿用 `TreeNodeItem.tsx:12-16` 的 `STATUS_COLORS`。
