# 统一模型价格管理计费口径

## Goal

让 CLI-Manager 内部历史/实时统计的费用展示和估算都以“设置 → 模型价格”中的 `model_prices` 为唯一计费来源，避免日志自带 cost、后端硬编码 fallback 与用户配置价格不一致。`ccusage` 面板保持使用 ccusage 自身价格计算，不纳入本任务。

## What I Already Know

- `model_prices` SQLite 表由前端 `modelPricingStore` 管理，并通过 `model_prices_set_cache` 推给 Rust 后端。
- 前端实时统计 `calculateCost` 已优先使用模型价格 store。
- Rust 历史统计 `calculate_usage_cost` 会优先使用后端价格缓存，但在缓存不可用时仍使用 `HISTORY_MODEL_PRICING` 硬编码 fallback。
- Rust 历史统计遇到日志内显式 `costUSD` / `totalCost` 等字段时，会优先使用显式 cost。
- `CcusageStatsPanel` 直接读取 ccusage 输出里的 `totalCost` / `costUSD` / `cost`；用户确认 ccusage 保持自身价格计算，不纳入本任务。
- 现有 backend 规范曾说明显式 cost 可优先使用；本任务会改变内部历史统计对显式 cost 的口径。

## Requirements

- 内部历史/实时统计展示的费用字段必须优先由 `model_prices` 中的模型价格和 token 用量计算。
- 历史统计在模型价格缓存已加载后，未知/已删除模型必须记为未定价，不得回落到硬编码价格。
- 历史 JSONL 中的显式 cost 字段不得覆盖本地模型价格计算；仅在无法按模型价格计算时作为非计费元数据保留或忽略。
- 不改远程价格同步流程，不新增依赖，不改变 `model_prices` 表结构。
- 不改 ccusage 面板费用口径。

## Acceptance Criteria

- [ ] 修改“模型价格”中某个模型单价后，终端实时统计和历史统计费用口径一致。
- [ ] 删除某个模型价格后，该模型费用不再使用内置默认价。
- [ ] 日志中带 `costUSD` 的记录不会绕过模型价格管理。
- [ ] `npx tsc --noEmit` 通过。
- [ ] `cd src-tauri && cargo check` 通过。

## Technical Approach

- 保留 `DEFAULT_MODEL_PRICES` 作为首次建表种子；避免在正常计费路径中把它当“第二套价格表”。
- 后端历史统计改为：缓存命中则计费；缓存已加载但 miss 则未定价；缓存不可用时尽量不产生硬编码费用，避免启动早期显示和管理页不一致。
- ccusage 面板保持现状，因为用户明确要求 ccusage 使用自身价格计算。

## Decision (ADR-lite)

**Context**: 用户要求项目内部价格计费统一使用模型价格管理，同时明确 ccusage 不用管。  
**Decision**: 历史/实时统计费用以 `model_prices` 为唯一计费来源；历史日志显式 cost 不再作为内部统计计费权威；ccusage 继续使用自身价格计算。  
**Consequences**: 带显式 cost 的历史记录费用可能变化；ccusage 面板费用仍可能与本地模型价格管理不同，这是有意保留。

## Out of Scope

- 不新增价格来源。
- 不重构统计 UI。
- 不修改 `model_prices` schema。
- 不改变 ccusage 面板费用计算。

## Technical Notes

- 相关文件：
  - `src/lib/modelPricing.ts`
  - `src/stores/modelPricingStore.ts`
  - `src/components/stats/termStatsUi.tsx`
  - `src-tauri/src/commands/history.rs`
  - `.trellis/spec/backend/model-pricing-contracts.md`
  - `.trellis/spec/backend/history-stats-contracts.md`
- GitNexus symbol impact for target functions returned `Target not found`; fallback impact assessment is based on direct reference search.
