# PTY Daemon Contracts (Phase 2: 守护进程)

> Issue #123 Phase 2。把 PTY 宿主从主进程抽为独立守护进程 `cli-manager-daemon`：UI 是客户端，应用真退出后任务继续跑，重启 attach 回放。前置 Phase 1（`background-task-continuation-contracts.md`）已上线。**本契约经用户确认后方可实施。**

## Scenario: Host PTY Sessions in a Detached Daemon Process

### 1. Scope / Trigger

- Trigger: 改动 `pty/manager.rs`、`commands/terminal.rs` 的 7 个 PTY 命令、`pty-output-{sessionId}`/状态事件链路、daemon 发现/鉴权、attach 回放、hook 上报转发时。
- 跨层：前端 `terminalStore`（**不改**）→ Tauri 命令（改为转发）→ DaemonClient ↔ loopback TCP ↔ `cli-manager-daemon`（PtyManager + ring buffer + hook 转发）。

### 2. Signatures

- 新二进制：`cli-manager-daemon`（workspace 新 crate `daemon/`，复用 `pty::manager`/`pty::boundary`/`shell_resolver`/`wsl` —— 这些模块随之与 `AppHandle` 解耦，输出改为回调/trait `PtyOutputSink`）。
- 发现文件：`~/.cli-manager/daemon.json`（dev 构建 `daemon.dev.json`，隔离规则对齐 sessions 文件）：`{ "port": u16, "token": String, "pid": u32, "version": String }`。daemon 启动时原子写入，退出时删除。
- 传输：`127.0.0.1` TCP，换行分隔 JSON 帧（NDJSON）。首帧必须 `{"type":"auth","token":...,"clientVersion":...}`，失败即断连。
- 请求：`create/write/resize/close/close_all/reconcile/status/list/attach/detach`（与现有 7 命令一一对应 + attach 语义）。推送：`{"type":"output","sessionId","data"(base64)}`、`{"type":"exit","sessionId","status"}`、attach 应答含 `{"sessionId","replay"(base64), "meta"}`。
- 主应用侧：`DaemonClient`（managed state）。`commands/terminal.rs` 各命令签名与注册名**不变**，实现改为：daemon 可用 → 转发；不可用 → 现有进程内 `PtyManager`（保留为 fallback，代码不删）。
- Hook 转发：daemon 常驻一个稳定 hook 转发端口；PTY 环境变量 `CLI_MANAGER_NOTIFY_PORT/TOKEN` 指向 **daemon**，daemon 把 hook 上报转发给当前连接的 app 客户端；无客户端时缓存最近 N 条（默认 200），attach 时补发。

### 3. Contracts

- **★前端零感知**：`pty-output-{sessionId}`、状态事件、7 个 invoke 命令的名称/参数/返回值语义不变。DaemonClient 收到 output 帧后由主进程原样 re-emit。`safe_emit_boundary`（UTF-8+ANSI 安全边界）逻辑必须保留在 daemon 侧切帧处，不得在转发层二次切割。
- **★hook 链路不因重启断裂**：现状 hook 端口随 app 每次启动变化且被烘焙进 PTY 子进程 env——daemon 化后 PTY 进程比 app 长寿，因此 hook 上报必须收口到 daemon 的稳定转发端口。app 的 `claude_hook.rs` 本地 server 保留，仅接收 daemon 转发（升级路径：daemon 模式下 `pty_create` 注入 daemon 端口而非 app 端口）。
- 鉴权：仅 `127.0.0.1`；token 随机 UUID，首帧校验失败立即断连并记日志；`daemon.json` 写入用户主目录（继承用户 ACL），不进日志。所有请求帧字段做格式/范围校验（sessionId 必须是已知 UUID，cols/rows 有界），非法帧断连——WebView→Rust→daemon 全程按不可信输入处理。
- Ring buffer：每会话保留尾部输出，字节上限默认 2 MiB/会话（≈对齐 `SNAPSHOT_MAX_LINES=2000` 的量级），attach 回放该 buffer；超限丢头部，必须在 ANSI 安全边界处丢弃。
- 生命周期：
  - app 启动：读 daemon.json → 版本握手成功且 pid 存活 → attach `list` 全部会话；文件不存在/连接失败/token 拒绝 → 视为无 daemon，拉起新 daemon（Windows `DETACHED_PROCESS|CREATE_NEW_PROCESS_GROUP`，Unix `setsid`）；拉起失败 → **降级进程内 PTY，应用必须照常可用**，仅 toast 提示后台续跑不可用。
  - app 正常退出：默认 `detach`（daemon 续跑）；用户在 Phase 1 弹窗选"仍然退出"→ 先 `close_all` 再退出（保持"仍然退出=中断任务"语义不变）。
  - daemon 自灭：无会话 且 无客户端连接 持续 10 分钟 → 自动退出并删 daemon.json。有会话时永不自灭。
  - 版本握手不匹配：daemon 无会话 → daemon 自杀，app 拉起新版本；有会话 → 沿用旧 daemon 并记 warn（协议帧需向后兼容：未知字段忽略，未知 type 报错不崩）。
- 孤儿回收：`pty_reconcile_active_sessions` 语义改为对 daemon 会话集执行；app 崩溃后 daemon 中的会话不是孤儿（这正是特性），只有 daemon.json 中 pid 已死而残留的 PTY 子进程才按现有孤儿清理逻辑处理。
- 环境隔离：dev 与安装版使用不同发现文件与不同 daemon 实例，互不 attach；dev daemon 的二进制路径来自 `target/debug`。
- 与 Phase 1 关系：Phase 1 弹窗语义升级——"转入后台"在 daemon 模式下允许**真退出 app 进程**（任务在 daemon 里跑）；托盘常驻路径保留为 daemon 不可用时的降级。快照落盘 + resume 恢复链路**完整保留**，作为 daemon 与 app 双双死亡时的最终兜底。

### 4. Validation & Error Matrix

- daemon.json 存在但 pid 已死 / 端口拒连 → 删除残留文件，拉起新 daemon，不报错给用户。
- token 校验失败（文件被篡改/串版本）→ 断连 + 删除文件重拉。
- 传输中断（daemon 崩溃）→ app 侧对全部 attach 会话发 exit 状态（error），提示用户；xterm 标签保留可手动重开。
- 单会话 attach 回放失败 → 该会话空画面 + warn，不影响其他会话。
- 非法帧/超长帧（>8 MiB）→ 断连防 DoS。
- WSL 会话：env 转发（`apply_wsl_env_forwarding`）在 daemon 侧执行，行为与现状一致。

### 5. Good/Base/Bad Cases

- Good: codex 任务运行中真退出 app → daemon 续跑；重开 app 自动 attach，尾部 2 MiB 画面回放，任务不间断可继续输入。
- Base: 首次启动无 daemon → 拉起后创建会话；daemon 拉起失败 → 进程内 PTY 降级，一切照旧。
- Base: 后台期间 claude 任务 Stop → hook 上报进 daemon 缓存，app 重开 attach 时补发通知事件。
- Bad: 转发层对 output 再切帧 → ANSI 序列被截断，前端花屏（必须只在 daemon 源头切）。
- Bad: hook env 仍注入 app 端口 → app 重启后 hook 上报打到死端口，Tab 状态永久 running。
- Bad: 版本升级直接杀有会话的旧 daemon → 用户任务被静默中断。

### 6. Tests Required（验收标准）

- Rust 单测：协议帧编解码（含未知字段/未知 type）、auth 失败断连、ring buffer 上限与 ANSI 边界丢弃、daemon.json 读写与 pid 存活判定、dev/安装版文件名选择。
- `cd src-tauri && cargo check && cargo test`；`npx tsc --noEmit`（前端应无 diff 或仅极小 diff）。
- 手动：真退出→daemon 续跑→重开 attach 回放；杀 daemon→app 降级可用；杀 app→daemon 10 分钟内因仍有会话不自灭；无会话 10 分钟后 daemon 自灭且 daemon.json 删除；"仍然退出"确实 close_all；hook 通知在 app 重启后仍能绑定 Tab 状态；WSL/PowerShell/CMD/Pwsh 各建一次会话行为一致；dev 与安装版并行互不串扰。

### 7. Wrong vs Correct

#### Wrong

```rust
// 转发层按固定长度切 output 再发前端 —— ANSI/UTF-8 序列被拦腰截断
let chunk = &buffer[..4096];
app_handle.emit(&format!("pty-output-{id}"), base64(chunk));
```

#### Correct

```rust
// daemon 源头用 safe_emit_boundary 切帧，转发层只透传完整帧
let safe = safe_emit_boundary(&pending); // daemon 侧
send_frame(OutputFrame { session_id, data: base64(safe) });
// app 侧收到帧后原样 re-emit，不做任何再分片
```
