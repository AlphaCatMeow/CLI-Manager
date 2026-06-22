# 历史用量分析按 24 小时统计

## Goal

历史用量分析在单日统计时，需要把 Token / 费用趋势与会话热力图从“按天聚合”改为“按 24 小时聚合”，让用户能看出一天内每个小时的用量和会话分布。

## What I already know

* 用户明确点名影响区域：历史用量分析、Token / 费用趋势、会话热力图。
* 当前后端 `history_get_stats` 返回 `daily_series`、`heatmap`、`hourly_activity`。
* 当前 `daily_series` 和 `heatmap` 是按天聚合；`hourly_activity` 只有 `hour`、`sessions`、`messages`，不包含 Token、费用或会话引用。
* 当前 `Token / 费用趋势` 使用 `stats.daily_series` 渲染。
* 当前 `会话热力图` 使用 `stats.heatmap` 渲染，并点击日期后展示当天会话。

## Requirements

* 单日统计范围内，Token / 费用趋势按 00:00-23:00 的 24 个小时展示。
* 单日统计范围内，会话热力图按 24 个小时展示，并保留点击下钻查看该小时会话的能力。
* 周、月、年、自定义多日范围维持现有按天趋势和按天热力图行为。
* 统计仍遵守现有来源过滤、项目过滤和日期范围过滤。

## Acceptance Criteria

* [ ] 选择“日”统计时，Token / 费用趋势横轴为 0-23 小时，展示每小时 Token 与费用。
* [ ] 选择“日”统计时，会话热力图展示 24 个小时格子，点击小时格子显示该小时的会话清单。
* [ ] 选择周/月/年/多日自定义范围时，现有按天趋势和按天热力图不退化。
* [ ] 无数据小时展示为 0，不出现 `NaN` 或空结构异常。
* [ ] 前端类型检查通过；后端检查或测试通过。

## Definition of Done

* 代码遵守现有前后端统计 payload 归一化模式。
* 不新增依赖。
* 不改变 Tauri command 名称。
* 完成静态检查；桌面 UI 运行态由人工按验收项检查。

## Out of Scope

* 不接入官方账单或实时价格源。
* 不修改历史解析、Token 计价规则或模型价格表。
* 不重做整个分析看板布局。

## Technical Notes

* Relevant files:
  * `src-tauri/src/commands/history.rs`
  * `src/lib/types.ts`
  * `src/stores/historyStore.ts`
  * `src/components/stats/StatsPanel.tsx`
  * `src/components/stats/TimelineHeatmap.tsx`
  * `src/components/stats/StatsHourlyActivityChart.tsx`
* Relevant spec:
  * `.trellis/spec/backend/history-stats-contracts.md`
  * `.trellis/spec/frontend/component-guidelines.md`
  * `.trellis/spec/frontend/state-management.md`
  * `.trellis/spec/frontend/quality-guidelines.md`
