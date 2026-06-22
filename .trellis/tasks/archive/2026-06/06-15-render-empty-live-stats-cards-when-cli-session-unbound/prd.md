# 未绑定 CLI 会话时实时统计卡片显示空数据而非提示文案

## Goal

终端右侧实时统计面板：当 4 张「会话级」卡片的 hook 绑定门控（`tokensBound`）为假时，不再用一段提示文案占位，而是照常渲染 4 张卡片图形、数据置空。

## 背景

`06-15-bind-live-stats-session-to-tab-and-gate-cards` 引入门控时，未绑定走「统一空态提示」（`EmptyHint` 文案：未绑定 … 暂不可用 …）。用户反馈：该文案破坏图形设计，应保留卡片骨架、仅数据为空。本任务调整这一表现。

## 现状

- `TerminalStatsPanel.tsx:358-371`：`tokensBound` 为假时，用 `EmptyHint` 替换 4 张卡片。
- `calculateTokenStats(null)` 返回全 0 的 `TokenStats`（`termStatsUi.tsx:78`）。
- `TrendCard / ModelContextCard / ToolsCard` 均接受 `session: HistorySessionDetail | null`，空输入有原生空态。
- `Donut` 用 `Math.max(1, total)` 兜底，全 0 输入安全（只画灰色底圈）。

## Requirements

- 删除未绑定时的 `EmptyHint` 提示文案。
- 无论 `tokensBound` 真假，均渲染 4 张卡片（Token 用量 / Token 趋势 / 模型与上下文 / 工具与扩展）。
- 未绑定时向 4 张卡片传入空数据：`session={null}`、`stats=EMPTY_TOKEN_STATS`（= `calculateTokenStats(null)`）。
- 会话信息卡、今日项目用量保持原样，不受影响。

## Acceptance Criteria

- [ ] 未绑定 hook 的终端：4 张卡片图形正常显示，数据为空（Donut 灰圈、$0.00、「暂无趋势数据」、模型/上下文为「—」、「暂无工具调用」）。
- [ ] 已绑定终端：4 张卡片照常显示真实数据，行为不变。
- [ ] 不再出现「未绑定 … 暂不可用」文案。
- [ ] `npx tsc --noEmit` 通过。

## Out of Scope

- 不改门控判定逻辑（`tokensBound` 计算不变）。
- 不改后端、hook、依赖。
- 不动会话信息卡与今日用量卡。

## Technical Notes

- `src/components/terminal/TerminalStatsPanel.tsx`：顶层加 `const EMPTY_TOKEN_STATS = calculateTokenStats(null)`；render 内用 `boundSession = tokensBound ? latestSession : null`、`boundStats = tokensBound ? stats : EMPTY_TOKEN_STATS` 喂 4 卡；删除 358-371 门控三元里的 `EmptyHint` 分支。

## 补充：用户验收后扩展（2026-06-15）

第一轮（4 卡空数据）上线后用户追加两点：

1. **会话信息卡统计也纳入门控**：`SessionInfoCard` 的「消息数 / 会话时长 / 用户·助手·工具角色分布」未绑定时置 0（此前显示的是项目最近会话的真实数字，属误导）。项目 / 路径 / 分支 / 来源徽章保留——它们来自当前终端，是准确的。
2. **空态保持骨架形状**：4 张卡未绑定时不再因条件渲染塌陷，补占位（模型卡进度条 0%、剩余空间「—」、各卡右上徽章「—」/0）。

### 实现

- `TerminalStatsPanel.tsx`：`SessionInfoCard` 新增 `statsSession` 入参，统计走 `boundSession`（绑定=真实，未绑定=null→0）；调用处传 `statsSession={boundSession}`。元信息仍用 `session`。
- `termStatsCards.tsx`：`TrendCard` / `ModelContextCard` / `ToolsCard` 用 `isEmpty = !session` 补骨架占位；`TokenUsageCard` 本就骨架完整，未改。
- 隔离：`isEmpty` 仅在 `session===null` 触发；`SessionStatsPanel.tsx` 恒传非空 session，历史会话面板行为不变。

### 验收补充

- [x] 未绑定终端：会话信息卡消息数 0 / 时长「—」/ 角色全 0（SegmentedBar 灰条），项目·路径·分支·来源保留。
- [x] 未绑定终端：4 卡空态与有数据时高度一致，无塌陷、无提示文案。
- [x] 历史会话面板展示不变。
- [x] `npx tsc --noEmit` 通过。
