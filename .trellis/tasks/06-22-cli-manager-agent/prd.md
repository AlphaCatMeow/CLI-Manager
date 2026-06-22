# 实现 CLI-Manager 内置 Agent 自动分屏

## Goal

让 CLI-Manager 原生支持 Claude Code 内部 subagent/background task（例如 `trellis-implement(...)`、`trellis-check(...)` 这类由当前会话派发的任务）在 UI 中触发可见的分屏/任务视图，而不是依赖用户本机安装额外工具。

## What I already know

* 用户明确不要依赖外部分屏工具，希望能力内置在 CLI-Manager。
* 现有 CLI-Manager 已有 Claude/Codex Hook 桥接：后端接收 Hook 上报并转发到前端 `claude-hook-notification`。
* 现有自动分屏更适合真实 CLI 终端会话，因为它依赖 session/start 类事件或终端会话信息。
* Claude Code 内部 `Agent` 工具启动的 subagent/background task 不是新的 PTY 终端进程，通常不会天然对应一个 CLI-Manager 终端 pane。

## Assumptions (temporary)

* MVP 应优先让这类内部 subagent 在 CLI-Manager 中“可见、可跟踪、可自动打开 pane/面板”，而不是强行伪造完整 PTY。
* 如果 Claude Hook 能提供 task notification 或相关元数据，前端可以把它映射到虚拟 agent pane；如果 Hook 不提供，则需要扩展 hook_client/hook server 协议或利用已有 notification payload。

## Open Questions

* 第一版使用“复用现有 PTY 的真实终端 pane 自动启动 Claude”，还是一次性实现 CMUX-style 的结构化 agent runner？

## Requirements (evolving)

* 不依赖任何用户额外安装的分屏工具。
* 模仿 CMUX 的“分屏启动对应 agent”体验，由 CLI-Manager 自己创建 pane 并启动本地 `claude`/`codex` 进程。
* 对用户通过 Claude Code 内部派发的 subagent/background task 给出 CLI-Manager 内置可视化能力。
* 尽量复用现有 Hook 通道、Tab 状态与通知机制。

## Acceptance Criteria (evolving)

* [ ] 用户发起 agent 任务后，CLI-Manager 能在当前工作区自动打开对应分屏。
* [ ] 新分屏能启动本地 `claude` 或后续支持的 agent CLI。
* [ ] 不要求用户安装额外分屏工具。
* [ ] 现有真实终端会话自动分屏逻辑不被破坏。
* [ ] 任务完成/失败状态能在 UI 上更新。

## Definition of Done (team quality bar)

* 前端类型检查通过（`npx tsc --noEmit`）。
* Rust 编译检查通过或说明未运行原因（`cd src-tauri && cargo check`）。
* 相关行为说明/设置文案更新（如有 UI 设置）。
* 回滚/兼容性风险已说明。

## Out of Scope (explicit)

* 不要求用户安装或配置额外分屏工具。
* 不把当前需求绑定到特定本机私有 skill。
* 不要求第一版完整重放 subagent 的全部 JSONL transcript。

## Research References

* [`research/cmux-agent-panes.md`](research/cmux-agent-panes.md) — CMUX 的内置 agent pane 是应用自己启动并管理本地 CLI 子进程，Claude 使用 stream-json/stdin-stdout 协议，UI 是专门的 agent transcript pane，而不是普通 PTY 终端。

## Research Notes

### CMUX 可借鉴点

* 应用内置 provider 概念，直接解析本机 `claude`、`codex` 等可执行文件。
* Claude provider 启动参数为 `-p --output-format stream-json --input-format stream-json --include-partial-messages --verbose`。
* 每个 agent pane 有独立运行状态、stdin/stdout/stderr、transcript、停止/完成事件。
* UI 上表现为“一个 pane 里启动了对应的 agent”，但内核是应用自己管理本地 CLI 子进程，不依赖用户额外安装分屏工具。

### CLI-Manager 现状

* `src/App.tsx` 已监听 `claude-hook-notification`，并对 `SubagentStart` 调用 `openSubagentTranscript`、对 `SubagentStop` 调用 `finishSubagentTranscript`。
* `src/App.tsx` 已监听 `subagent-transcript-append`，并路由到 `appendSubagentTranscript`。
* `src-tauri/src/claude_hook.rs` 的 payload 校验已允许 Claude/Codex 来源的 `SubagentStart` 与 `SubagentStop`。
* `src/stores/terminalStore.ts` 已有 `subagent-transcript` 伪会话：能分屏显示内部子任务 transcript，但它不是新启动的真实 Claude 进程。
* `src-tauri/src/commands/subagent_transcript.rs` 已能 tail 子任务 jsonl 并推送到前端。

### Key constraint

* Claude Code 内部 `Agent` 工具已经启动的 subagent，本质上不是 CLI-Manager 管理的 PTY/子进程；CLI-Manager 可以通过 Hook 把它镜像成 transcript pane，但不能把这个已存在的内部 subagent 变成真实终端进程。
* 现有内部 subagent 虚拟 tab 的输出链路是：`SubagentStart` hook 携带 `agentTranscriptPath`/`transcriptPath` → 前端创建 `subagent-transcript` 伪会话并分屏 → Rust `subagent_transcript_subscribe` 轮询 tail JSONL 文件 → 前端按 JSONL 行解析 user/assistant/tool 内容并渲染。
* CMUX 风格的“分屏启动对应 Claude”必须由 CLI-Manager 自己作为 orchestrator：创建 pane、启动本地 `claude`/`codex` 进程、保存会话状态、接管输入输出。
* 因此需要把“内部 subagent 自动可见”和“CLI-Manager 内置启动真实 agent pane”作为两个可组合但不同的能力处理。

### Feasible approaches here

**Approach A: PTY 真终端分屏（推荐 MVP）**

* How it works: 复用现有 `pty_create` / pane tree，在父会话旁边新建真实终端 pane，并自动执行一条可配置的 `claude` 启动命令。
* Pros: 最贴近用户看到的“分屏启动 Claude”；复用现有终端、Hook、Tab 状态、输入输出和关闭逻辑；实现风险最低。
* Cons: 输出是普通终端文本，不是 CMUX 那种结构化 transcript UI；需要定义如何从当前任务生成启动命令。

**Approach B: CMUX-style 结构化 Agent pane**

* How it works: 新增 Rust 后端 agent runner，用 pipe 启动 `claude -p --output-format stream-json ...`，解析 JSON stream，前端新增专门 agent pane UI。
* Pros: 架构最接近 CMUX；可做结构化消息、活动状态、停止/继续。
* Cons: 需要新增 provider runner、协议解析、UI store、Tauri commands/capabilities；范围明显更大。

**Approach C: 增强现有子任务 transcript 分屏**

* How it works: 保留现有 Hook 驱动的 `subagent-transcript` 伪分屏，把 UI 和生命周期做完整。
* Pros: 变化最小，适合已经由当前 Claude 会话内部派发的 subagent。
* Cons: 不是“分屏启动 Claude”，只能显示已有内部子任务，不满足 CMUX 观感。

## Technical Notes

* 需要继续检查：如何从当前 CLI 会话/任务上下文生成新 pane 的 Claude 启动命令。
* 需要继续检查：设置页是否应提供 provider executable/path 和默认启动模式。
* 需要继续检查：新建 agent pane 是否复用 `TerminalSession.kind`，还是新增更明确的 `agent` kind。
