# 优化模型价格同步与推理强度模型识别

## Goal

减少模型价格同步的无效全量更新，并让本地模型识别、远程同步和费用估算正确处理带 reasoning effort 的模型变体，例如任意 `模型名(high)` / `模型名(xhigh)`。

## Changelog Target

[TEMP]

## What I Already Know

- 用户希望同步策略同时支持“只同步缺失价格的本地模型”和“只同步当前筛选范围”。
- 当前设置页已有 `saved/missing/candidates/all` 筛选和 `currentSyncTargets`，但在 `all` 筛选下主同步按钮会同步已保存价格与本地识别模型的并集，容易造成全量更新。
- 当前后端价格同步只拉取 LiteLLM 与 OpenRouter。
- 当前 `gpt-5.3-codex-spark`、`gpt-5.5(xhigh)` 这类本地模型可能无法从现有来源精确匹配。
- 价格不能猜；没有权威来源或明确映射时必须作为候选/未匹配，而不是静默套用基础模型价格。
- 本轮前置修复已让生产逻辑按任意 `model + effort` 组合生成 `模型名(effort)`，不应写死 `gpt-5.5`。

## Requirements

- 模型价格设置页提供两个清晰同步入口：
  - 只同步缺失价格的本地模型。
  - 同步当前筛选范围。
- “同步当前筛选范围”必须尊重当前筛选与搜索条件，不能在 `all` 页无条件同步全部已保存价格。
- 保留单行模型的同步按钮，只同步该模型。
- 远程价格同步需要解释无法匹配的原因：现有来源没有精确模型、只有候选、或需要手工添加。
- 本地模型识别必须能返回用户实际使用过的 `gpt-5.5(high)`、`gpt-5.4(xhigh)`、`gpt-5.5(xhigh)` 等模型变体。
- 如新增价格来源，必须是可公开访问、可机器解析、且价格字段单位明确的来源；不能用非权威文本猜价。

## Acceptance Criteria

- [ ] 在“缺失”筛选或点击“同步缺失价格”时，只请求缺失模型目标。
- [ ] 在“已保存/缺失/候选/全部 + 搜索词”下点击“同步当前筛选范围”，只请求当前可见范围对应模型。
- [ ] `gpt-5.5(high)`、`gpt-5.4(xhigh)`、`gpt-5.5(xhigh)` 出现在本地历史后，识别本地模型能列出这些模型。
- [ ] 对没有远程精确价格的变体，UI 不静默写入基础模型价格；显示候选或未匹配。
- [ ] 后端/前端验证通过：`cargo check`、相关 Rust 测试、`npx tsc --noEmit`。

## Out of Scope

- 不改数据库结构。
- 不猜测 `gpt-5.3-codex-spark` 或 effort 变体的官方价格。
- 不改变 ccusage 面板自身外部工具的计价口径。
- 不做发布版本号更新。

## Technical Notes

- 相关文件：
  - `src/components/settings/pages/ModelPricingSettingsPage.tsx`
  - `src/stores/modelPricingStore.ts`
  - `src-tauri/src/commands/model_pricing.rs`
  - `src-tauri/src/commands/history.rs`
  - `src/lib/modelPricing.ts`
- 相关规格：
  - `.trellis/spec/backend/model-pricing-contracts.md`
  - `.trellis/spec/backend/history-stats-contracts.md`
  - `.trellis/spec/frontend/state-management.md`

## Technical Approach

- 设置页保留两个同步入口：“同步缺失价格”和“同步当前范围”。
- 当前范围按当前筛选和搜索后的可见模型计算；`all` 不再无条件同步全部保存价与发现模型。
- 后端远程匹配只自动应用确定性匹配；`模型(effort)` 对基础模型价格只产出候选，不静默套用。
- 本地模型识别兼容 `model + effort`、`model(effort)`、`model-high/xhigh`，并通过历史索引版本升级让旧缓存重新扫描。

## Decision (ADR-lite)

Context: 远程价格源通常只公开基础模型价格，不公开 reasoning effort 变体价格。
Decision: 不猜价；精确匹配自动同步，基础模型对 effort 变体只作为候选让用户确认。
Consequences: 首次升级后历史索引会重新扫描一次；未确认的 effort 变体继续计入未定价 Token。
