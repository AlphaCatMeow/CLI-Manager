# fix-provider-switch-mantine-provider

## Goal

修复点击项目“切换供应商”弹窗时报 `@mantine/core: MantineProvider was not found in component tree` 的运行时异常，保证供应商列表可正常点击和切换。

## Requirements

- 只做最小局部修复。
- 将 `ProviderRow` 内部的 Mantine `UnstyledButton` 替换为原生 `button`。
- 保持现有视觉、disabled、hover、`aria-pressed` 行为。
- 不新增依赖。
- 不把 MantineProvider 提升到全局。
- 不修改供应商切换业务逻辑和 Tauri command payload。

## Acceptance Criteria

- [ ] 点击打开“切换供应商”弹窗不再因为缺少 MantineProvider 崩溃。
- [ ] 供应商行按钮仍保留选中态、禁用态、hover 背景和 focus ring。
- [ ] `ProviderBadge` 仍可被设置页复用。
- [ ] `npx tsc --noEmit` 通过。

## Definition of Done

- 代码只修改必要文件。
- 静态类型检查通过。
- 运行态 UI 验收由人工完成，不由 AI 启动 Tauri 桌面应用。

## Technical Approach

`ProviderSwitchModal` 在侧边栏中独立渲染，不在 `SettingsModal` 的 `AppMantineThemeProvider` 子树内；但它复用的 `ProviderRow` 引用了 Mantine `UnstyledButton`。最小修复是移除 `ProviderRow` 对 Mantine 的依赖，用原生 `button` 实现相同无样式按钮行为。

## Decision (ADR-lite)

**Context**: Mantine 组件必须位于 `MantineProvider` 下；供应商切换弹窗不是设置页子树。

**Decision**: 不扩大 MantineProvider 作用域，只把 `ProviderRow` 改为原生按钮。

**Consequences**: 修复范围最小，避免全局 Provider 改动带来的样式/主题影响；需要显式 reset 原生 button 默认样式。

## Out of Scope

- 全局包裹 `AppMantineThemeProvider`。
- 重构供应商设置页。
- 改动 cc-switch 后端命令。
- 新增自动化 UI 测试。

## Technical Notes

- 已检查 `src/components/SettingsModal.tsx`：设置页内部包裹了 `AppMantineThemeProvider`。
- 已检查 `src/components/sidebar/index.tsx`：`ProviderSwitchModal` 从侧边栏直接渲染。
- 已检查 `src/components/ProviderSwitchModal.tsx`：弹窗使用 `ProviderRow` 渲染供应商行。
- 已检查 `src/components/provider/ProviderRow.tsx`：该组件从 `@mantine/core` 引入 `UnstyledButton`。
- 前端规范要求设置页标准控件可使用 Mantine，但本弹窗不在设置页 Mantine Provider 子树，局部按钮不应强依赖 Mantine。
