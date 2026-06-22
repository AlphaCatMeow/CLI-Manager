# CLI Hook Contracts

Concrete contracts for Claude/Codex hook integration.

## Scenario: Sub-Agent Transcript Hook

### 1. Scope / Trigger

- Trigger: a CLI emits `SubagentStart` and CLI-Manager opens a read-only transcript pane for that child agent; the matching `SubagentStop` marks it finished and closes the pane after a short grace period.
- Applies to: hook installation, hidden `__hook` client, local TCP bridge payload, frontend `CliHookPayload`, and transcript subscription.

### 2. Signatures

- Installed hook command: `<cli-manager-exe> __hook --source <claude|codex> --event <event>`.
- Bridge event name: `claude-hook-notification`.
- Frontend subscribe command: `subagent_transcript_subscribe({ key, transcriptPath, cwd, sessionId, agentId })`.
- Frontend store action on stop: `finishSubagentTranscript(payload)`.

### 3. Contracts

- Common payload fields: `tabId`, `source`, `event`, `title`, `message`, `sessionId`, `cwd`, `timestamp`.
- Claude sub-agent fields: `agentId`, `agentType`, `agentTranscriptPath`.
- Codex sub-agent fields: `agentId`, `agentType`, `transcriptPath`.
- Frontend transcript path priority: `agentTranscriptPath ?? transcriptPath ?? derive from cwd/sessionId/agentId`.
- `SubagentStart` and `SubagentStop` must be installed/uninstalled together for each source.
- Stop routing priority: match by `agentId`; if missing, close only when exactly one transcript pane belongs to the parent `tabId`.

### 4. Validation & Error Matrix

- Empty or overlong `tabId` -> bridge rejects with `400 invalid payload`.
- Unknown `source` -> bridge rejects with `400 invalid payload`.
- Event not allowed for its source -> bridge rejects with `400 invalid payload`.
- Missing explicit transcript path and missing derivation fields -> `subagent_transcript_subscribe` returns the specific missing field error.
- Missing or ambiguous stop target -> frontend does nothing; it must not guess and close multiple child panes.

### 5. Good/Base/Bad Cases

- Good: Codex `SubagentStart` includes `transcript_path`; frontend subscribes directly to that path.
- Base: Claude `SubagentStart` includes `agent_transcript_path`; frontend uses it unchanged.
- Good: `SubagentStop` includes `agent_id`; frontend marks the pane ended and closes it after the grace delay.
- Bad: A new hook event is installed but not added to the bridge whitelist; the hook silently posts but the bridge rejects it.
- Bad: `SubagentStop` has no `agent_id` while multiple child panes share one parent; frontend must not close all of them.

### 6. Tests Required

- Hook install/uninstall tests assert `SubagentStart` and `SubagentStop` are written and removed for the affected source.
- Rust compile check must pass after bridge payload or command signature changes.
- TypeScript type-check must pass after `CliHookPayload` field changes.

### 7. Wrong vs Correct

#### Wrong

```ts
transcriptPath: payload.agentTranscriptPath ?? null
```

#### Correct

```ts
transcriptPath: payload.agentTranscriptPath ?? payload.transcriptPath ?? null
```

## Scenario: System-Level Hook Notifications

### 1. Scope / Trigger

- Trigger: a `claude-hook-notification` payload should also surface as an OS-level notification while preserving the existing in-app toast and tab status behavior.
- Applies to: frontend hook event listener, persisted hook notification settings, Tauri notification permission, and WSL-to-Windows notification bridge commands.

### 2. Signatures

- Frontend event: `listen<CliHookPayload>("claude-hook-notification", handler)`.
- Frontend setting fields: `systemNotificationsEnabled: boolean` and `systemNotificationEvents: Record<HookEventType, boolean>`.
- Hook event union for system notifications: `SessionStart | UserPromptSubmit | Notification | Stop | StopFailure | PermissionRequest`.
- Backend command: `is_wsl() -> bool`.
- Backend command: `send_notification_via_windows(title: String, body: String) -> Result<(), String>`.
- Non-WSL frontend notifier: `sendNotification({ title, body })` from `@tauri-apps/plugin-notification`.

### 3. Contracts

- System notifications are **additive**: they must not replace app toast cards or tab status indicators.
- Default event settings: `Stop`, `StopFailure`, `PermissionRequest`, and `Notification` enabled; `SessionStart` and `UserPromptSubmit` disabled.
- Project name priority: `tabTitle` -> basename of `payload.cwd` -> `"未知项目"`.
- Title format: `CLI-Manager`; the OS notification should be attributed to the app rather than the CLI process.
- Body format: emoji + `Claude Code`/`Codex CLI` + project/event phrase, optionally appending `payload.message`.
- WSL fallback path: frontend first tries the Tauri notification plugin; only if that send path throws and `is_wsl` is true may it call `send_notification_via_windows`.
- Backend guard: `send_notification_via_windows` must reject non-WSL calls so Windows native app instances cannot accidentally show a `Windows PowerShell` source/icon.
- Non-WSL path: frontend checks/requests notification permission before `sendNotification`; Windows native app instances must not route through PowerShell because that makes the toast appear as `Windows PowerShell`.
- Click behavior: do not implement deep links or tab jumps; rely on OS window foregrounding plus existing tab status indicators.

### 4. Validation & Error Matrix

- `systemNotificationsEnabled === false` -> no system notification, no error.
- `systemNotificationEvents[payload.event] !== true` -> no system notification, no error.
- Event outside `HookEventType` (e.g. transcript-only hook events) -> no system notification, no error.
- Non-WSL notification permission denied -> no system notification; log warning only.
- `is_wsl` command failure or notification API failure -> catch and log warning; app toast/tab state must continue.
- WSL bridge title/body too long or containing NUL -> command returns `Err(String)`; frontend catches and logs warning.
- `powershell.exe` unavailable in WSL -> command returns `Err(String)`; frontend catches and logs warning.

### 5. Good/Base/Bad Cases

- Good: `Stop` for a tab titled `CLI-Manager` sends title `CLI-Manager` with body like `✅ Claude Code 在 CLI-Manager 的任务已完成` and still updates the tab status.
- Good: WSL `PermissionRequest` sends through `send_notification_via_windows` without asking Tauri notification permission, and the Toast XML includes `来自 CLI-Manager` attribution.
- Base: `SessionStart` updates session binding but sends no system notification under default settings.
- Bad: system notification failure prevents `showClaudeHookToast` or `handleCliHookEvent` from running; notification errors must stay isolated.
- Bad: Windows native app instances route through PowerShell and show source `Windows PowerShell`; they must use the Tauri notification plugin path.
- Bad: using a deep link or notification action to jump tabs; desktop click callbacks are not reliable enough for this feature.

### 6. Tests Required

- TypeScript type-check must pass after changes to `HookEventType`, settings migration, or notification event filtering.
- Rust compile check must pass after changes to `is_wsl` or `send_notification_via_windows` signatures.
- Manual Windows/macOS/Linux smoke test: enabled event produces an OS notification with expected title/body.
- Manual WSL smoke test: enabled event produces a Windows Toast through `powershell.exe`.
- Settings UI test point: toggling one event preserves the other `systemNotificationEvents` values.
- Regression test point: app toast and tab indicators still work when system notifications are disabled or fail.

### 7. Wrong vs Correct

#### Wrong

```ts
await sendSystemNotification(payload, tabTitle);
showClaudeHookToast(payload, tabId);
```

#### Correct

```ts
showClaudeHookToast(payload, tabId);
void sendSystemNotification(payload, tabTitle);
```
