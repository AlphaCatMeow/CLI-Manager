# unify project provider switch UI

## Goal

项目级“切换供应商”弹窗中的供应商列表，视觉上改成设置页“供应商”列表同款 UI，降低同一供应商概念在两个入口里的割裂感。

## What I already know

- 用户要求：项目切换供应商的 UI 使用设置里切换供应商列表一样的 UI，直接移植过来。
- 当前项目弹窗在 `src/components/ProviderSwitchModal.tsx`，供应商行使用 `ProviderRow`，风格是左侧强调条的大行样式。
- 设置页同款列表行是 `ProviderSettingsPage.tsx` 内部的 `ProviderListItem`：左侧 40px 厂商图标砖、中间名称/副标题、右侧状态 badge + `ChevronRight`。
- 设置页使用 `VendorIcon` + `inferVendor` 推断品牌图标。
- `ProviderSwitchModal` 只在 `src/components/sidebar/index.tsx` 中被引用。
- GitNexus impact 对 `ProviderSwitchModal` / 文件路径返回 `Target not found`，未能给出图谱影响；已用 Serena 查到引用范围仅侧边栏导入与渲染。

## Requirements

- 项目切换供应商弹窗里的供应商列表项改成设置页供应商列表项同款视觉。
- 保留现有切换逻辑：选择供应商、恢复跟随全局、解析失败禁用、切换中状态、当前项目匹配状态。
- 不改后端命令、不改数据库读取逻辑、不新增依赖。

## Acceptance Criteria

- [ ] 项目级切换供应商列表项视觉与设置页列表项一致：图标砖、名称/副标题、badge、右侧箭头。
- [ ] 当前项目匹配供应商仍能显示选中态。
- [ ] “全局当前 / 分类 / 配置解析失败 / 切换中”状态不丢失。
- [ ] `npx tsc --noEmit` 通过，或如失败则明确报告失败原因。

## Definition of Done

- TypeScript 类型检查通过或已如实报告现有/新增错误。
- 只做必要 UI 改动，不改业务行为。
- 不启动桌面应用做人工 UI 验收；UI 最终由用户人工确认。

## Technical Approach

最小方案：只改 `src/components/ProviderSwitchModal.tsx`，把设置页 `ProviderListItem` 的行布局和样式移植为弹窗内局部组件，并适配项目切换特有的状态与操作。

## Decision (ADR-lite)

**Context**: 设置页 `ProviderListItem` 是局部组件，当前弹窗使用另一套 `ProviderRow` 风格。

**Decision**: 为降低影响范围，本次不抽公共组件、不改设置页，直接在 `ProviderSwitchModal.tsx` 里移植同款行 UI。

**Consequences**: 改动小、风险低；代价是两处 UI 代码存在少量重复。若后续频繁同步样式，再抽公共组件。

## Out of Scope

- 不重构设置页 `ProviderSettingsPage.tsx`。
- 不新增搜索、详情面板或设置页其它交互。
- 不修改 cc-switch 后端命令或供应商数据结构。
- 不处理无关的 `src-tauri/Cargo.toml` 当前未提交改动。

## Technical Notes

- 已读：`src/components/ProviderSwitchModal.tsx`
- 已读：`src/components/provider/ProviderRow.tsx`
- 已读：`src/components/settings/pages/ProviderSettingsPage.tsx` 中 `ProviderListItem` 和供应商页样式片段
- 已读：`src/components/VendorIcon.tsx`
- 已查引用：`ProviderSwitchModal` 仅由 `src/components/sidebar/index.tsx` 使用
