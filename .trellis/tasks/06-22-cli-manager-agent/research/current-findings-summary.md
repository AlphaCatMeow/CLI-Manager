# Current Findings Summary: CLI-Manager Agent 分屏

Date: 2026-06-22

## 当前结论

CLI-Manager 现有内部 subagent 虚拟 tab 是“转录镜像”，不是新启动的 Claude 进程。

现有链路：

1. Claude/Codex hook 发出 `SubagentStart`。
2. payload 携带 `agentId`、`agentTranscriptPath` / `transcriptPath`。
3. 前端 `App.tsx` 调用 `terminalStore.openSubagentTranscript()`。
4. `terminalStore` 创建 `kind: "subagent-transcript"` 的伪会话，并在父会话旁边 split 出只读 pane。
5. Rust `subagent_transcript_subscribe` 轮询 tail JSONL 文件，每 250ms 推送完整新增行。
6. 前端 `appendSubagentTranscript()` 累积内容。
7. `SubagentTranscriptView` 逐行 `JSON.parse`，提取 Claude/Codex 的 user、assistant、tool 内容并渲染。

因此当前能力适合“镜像已存在内部子任务输出”，但不能把已启动的内部子任务变成真实终端进程。

## CMUX 调研结论

CMUX 的 agent pane 不是依赖用户额外安装分屏工具。它由应用自己启动并管理本地 agent CLI 子进程。

关键点：

- 应用内置 provider 概念，例如 `claude`、`codex`、`opencode`。
- Claude provider 使用本地 `claude` 可执行文件。
- Claude 启动模式类似：

```bash
claude -p --output-format stream-json --input-format stream-json --include-partial-messages --verbose
```

- 应用持有子进程、stdin、stdout、stderr。
- UI pane 显示 agent 运行状态、输出、完成/失败事件。
- Claude 输出通过 stream-json 解析成结构化 transcript，而不是普通 PTY 文本。

## CLI-Manager 可行路线

### 路线 A：PTY 真终端分屏启动 Claude（推荐 MVP）

复用现有 PTY 与分屏树：

1. 新增“Agent 分屏启动器”。
2. 在当前 pane 旁边自动 split。
3. 新建真实 PTY session。
4. 自动执行本地 `claude` 启动命令，可带 prompt。
5. 复用现有 Hook、Tab 状态、终端输出、关闭和分屏逻辑。

优点：最接近“分屏启动 Claude”的视觉体验，改动较小，风险较低。

缺点：输出是普通终端文本，不是结构化 transcript UI。

### 路线 B：CMUX-style 结构化 Agent pane

新增 Rust Agent Runner：

1. 后端直接启动 `claude -p --output-format stream-json ...`。
2. 后端写 JSONL 到 stdin。
3. 后端解析 stdout stream-json。
4. 前端新增 Agent pane UI/store。
5. 支持动态 assistant delta、tool use、完成/失败状态。

优点：架构和体验最接近 CMUX。

缺点：需要新增 provider runner、协议解析、Tauri commands/capabilities、前端 store/UI，范围较大。

### 路线 C：增强现有 transcript 分屏

保留现有 hook + JSONL tail 架构，只补强 UI、生命周期和稳定性。

优点：改动最小，适合内部 subagent 输出展示。

缺点：不是“启动 Claude”，只是只读镜像。

## 推荐分阶段方案

1. MVP：做路线 A，提供内置“Agent 分屏启动器”，先让 CLI-Manager 能自动 split pane 并启动真实 Claude CLI。
2. 后续：保留现有内部 subagent transcript pane，用于镜像当前 Claude 会话内部派发的子任务。
3. 进阶：做路线 B，新增结构化 Agent Runner，解析 Claude stream-json，形成类似 CMUX 的专门 Agent UI。

## 已保存的详细研究

- `research/cmux-agent-panes.md`：CMUX agent pane 源码调研与 CLI-Manager 映射。
- `prd.md`：当前需求、约束、可行方案与验收标准。
