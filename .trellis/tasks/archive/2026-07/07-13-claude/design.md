# Technical Design

## Frontend

- `StatuslineSettingsPage.tsx` 使用 `ScrollArea.Autosize mah={540}`，避免短内容被固定高度撑开。
- 布局行空白点击清空 `selectedId`；组件点击对当前选中项执行切换。
- Powerline 选项和预览使用 `normalizeTerminalFontFamily(settingsStore.fontFamily)`。
- `StatuslinePreview.tsx` 移除 Powerline 字符替换，ANSI 解析增加 xterm 256 色索引到 RGB 的转换。

## Backend

- 将 Powerline 主题定义扩展为 ANSI16、ANSI256、TrueColor 三套前景/背景数组。
- `powerline_theme` 接收 `color_level`，返回对应色阶。
- 保持 `render_internal` 作为运行时与预览共用入口。

## Validation

- Rust 单元测试断言三种色阶的转义序列及端帽、分隔符保持不变。
- TypeScript 类型检查验证 Mantine、ANSI 解析和字体状态访问。
- 不启动 Tauri，列出人工检查项。
