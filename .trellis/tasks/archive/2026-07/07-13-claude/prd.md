# 修复 Claude 状态栏编辑器与预览

## Goal

修复 Claude Code 状态栏配置页的组件库高度、Powerline 字形、属性面板切换和主题预览问题，使设置页预览与内置 Rust 运行时保持一致，并对齐 ccstatusline-zh v2.2.23 的色阶语义。

## Changelog Target

`[TEMP]`

## Requirements

- 组件库内容不足时按内容收缩，内容超过上限后再出现滚动条。
- Powerline 分隔符、起始端帽和结束端帽不显示乱码。
- 选择组件后，可通过再次点击该组件或点击布局空白处返回全局属性。
- 预览保留真实 Powerline 字形，并使用当前终端字体栈。
- ANSI 预览支持 16 色、256 色和 TrueColor。
- Rust Powerline 主题按 `colorLevel` 使用 ccstatusline-zh v2.2.23 对应色板。
- 实际 `__statusline` 输出与设置页预览继续复用同一 Rust 渲染结果。

## Acceptance Criteria

- [x] 组件库无多余固定高度空白，长列表仍可滚动。
- [x] Powerline 下拉选项和预览不再使用普通三角形替代真实字形。
- [x] 组件属性和全局属性可以双向切换。
- [x] `colorLevel=1/2/3` 分别产生 ANSI16、ANSI256、TrueColor 主题序列。
- [x] 前端能正确解析 `38;5;n`、`48;5;n`、`38;2;r;g;b`、`48;2;r;g;b`。
- [x] `npx tsc --noEmit`、`cargo check` 和状态栏相关 Rust 测试通过。
- [x] CHANGELOG 与状态栏编辑器契约同步更新。

## Definition of Done

- 仅修改状态栏相关代码和必要文档。
- 不启动 Tauri 桌面应用，由用户完成视觉验收。
- 保留现有未提交文件，不混入本任务改动。

## Technical Approach

- Mantine 组件库滚动区改用 `ScrollArea.Autosize` 和最大高度。
- 属性选择使用现有 `selectedId`，通过清空选择恢复全局面板，不新增状态层。
- 前端预览直接显示 Rust ANSI 文本中的 Powerline PUA 字符，并使用规范化终端字体。
- Rust 主题表按色阶存储上游调色板，渲染时根据 `settings.color_level` 选择。

## Decision (ADR-lite)

**Context**: 当前预览通过替换字形和固定 ANSI16 色板规避浏览器渲染问题，导致与真实终端效果不一致。

**Decision**: 保留真实 Powerline 字形，补齐终端字体和 ANSI256 支持；Rust 主题色板直接对齐固定上游版本。

**Consequences**: 后端渲染影响实际 CLI 状态栏，需用 Rust 单元测试覆盖三种色阶；未选择 Powerline 字体时仍可能由系统字体回退决定字形质量。

## Out of Scope

- 重构完整状态栏编辑器。
- 新增依赖或自动修改用户终端字体设置。
- 补齐本次问题之外的 ccstatusline-zh 渲染差异。

## Technical Notes

- GitNexus：`ClaudeStatuslineEditor`、`StatuslinePreview`、`parseAnsi` 为 LOW；`powerline_theme`、`render_internal` 为 HIGH。
- HIGH 风险直接覆盖 `render`、`render_preview`，并间接影响 `run_and_exit` 与 Tauri 预览命令。
- 上游基线：https://github.com/huangguang1999/ccstatusline-zh/tree/v2.2.23
- 研究记录：[`research/statusline-preview.md`](research/statusline-preview.md)。
- 验证结果：TypeScript 类型检查通过；`cargo check` 通过；隔离 Cargo 目标目录运行状态栏相关测试 16 项全部通过。
