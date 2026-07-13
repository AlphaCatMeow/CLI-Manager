# Statusline Preview Research

## Mantine 9

- 当前项目使用 `@mantine/core ^9.3.1`。
- Mantine 9 提供 `ScrollArea.Autosize`，内容高度在达到最大高度后才启用滚动，适合组件库面板。

## ccstatusline-zh v2.2.23

- 上游预览直接输出 Powerline PUA 字符，不替换为普通三角形。
- Powerline 主题分别定义 ANSI16、ANSI256、TrueColor 色板。
- 渲染器根据 `settings.colorLevel` 选择主题色阶。

## Local Findings

- 当前 `normalizePreviewGlyphs` 破坏了 Powerline 连续背景连接效果。
- 当前前端 ANSI 解析不支持 `38;5` / `48;5`。
- 当前 Rust `powerline_theme` 仅包含 ANSI16 色板，即使默认 `colorLevel=2` 也不会使用上游 ANSI256 色板。
