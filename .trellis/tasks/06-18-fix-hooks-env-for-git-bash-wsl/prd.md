# fix-hooks-env-for-git-bash-wsl

## Goal

Fix CLI hooks callback environment injection so Claude/Codex hooks can call back to CLI-Manager when users start tools from Git Bash and similar terminal tabs. The current behavior depends on title/startup command detection, so manually launching Claude/Codex after opening a normal shell can miss `CLI_MANAGER_NOTIFY_PORT` and `CLI_MANAGER_NOTIFY_TOKEN`.

## What I already know

* User reported Git Bash and WSL terminal types do not support hooks callbacks.
* Current frontend only enables hook env when `detectCliHookTool(title, startupCmd)` recognizes Claude/Codex.
* Rust `pty_create` always injects `CLI_MANAGER_TAB_ID`, but only injects notify port/token when `hookEnvEnabled` is true.
* Hook scripts exit silently when `CLI_MANAGER_TAB_ID`, `CLI_MANAGER_NOTIFY_PORT`, or `CLI_MANAGER_NOTIFY_TOKEN` is missing.
* Git Bash has shell runtime OSC injection support via rcfile; WSL shell runtime injection is explicitly marked unreliable.
* This task is about hook callback env, not shell runtime OSC injection.

## Requirements

* Enable CLI hook callback environment for newly-created terminal sessions whenever either Claude or Codex hooks are installed.
* Do not require the tab title or startup command to already contain `claude` or `codex`.
* Preserve existing hook bridge security model: random local token, loopback port, per-tab `CLI_MANAGER_TAB_ID`.
* Keep WSL behavior honest: inject Windows-side environment where possible, but do not claim full Linux-side WSL hook support if the CLI/hook config lives inside WSL and cannot reach the Windows PowerShell hook script path.
* Avoid changing hook installation format unless required.

## Acceptance Criteria

* [ ] Opening a Git Bash tab after installing Claude/Codex hooks receives `CLI_MANAGER_NOTIFY_PORT` and `CLI_MANAGER_NOTIFY_TOKEN` env vars.
* [ ] Starting Claude/Codex from a normal Git Bash tab can trigger installed hook callbacks without relying on tab title/startup command detection.
* [ ] Existing explicit Claude/Codex startup tabs still work.
* [ ] Shell runtime monitoring gating remains separate and unchanged.
* [ ] Rust/TypeScript static checks relevant to changed files are run, or limitations are reported.
* [ ] Manual verification notes are provided for Git Bash and WSL callback behavior.

## Definition of Done

* Minimal code change, no new dependency.
* Existing Tauri command contract remains stable unless clearly justified.
* `npx tsc --noEmit` and `cd src-tauri && cargo check` attempted after changes.
* Any WSL limitation is documented in the final response.

## Technical Approach

Use the smallest frontend-side change: replace title/startup command based hook-env enablement with installed-hook-status based enablement. If either Claude or Codex hook status is `installed`, pass `hookEnvEnabled: true` to `pty_create` for new sessions. This lets Rust inject notify port/token for all new terminal tabs while still keeping the callback authenticated by the per-app random token.

## Decision (ADR-lite)

**Context**: Users may open a plain Git Bash/WSL tab and only then run Claude/Codex, so startup metadata is insufficient.

**Decision**: Enable hook callback env by installed hook status, not by startup command detection.

**Consequences**: More terminal tabs receive local callback env vars, but they are scoped to localhost and protected by a random token. This avoids brittle CLI-name detection. WSL may still require separate cross-boundary support if the CLI and hook scripts live entirely inside Linux.

## Out of Scope

* Rewriting hook install scripts.
* Adding native Linux/WSL hook script installation.
* Changing shell runtime monitoring OSC injection for WSL.
* Starting the Tauri app for manual UI verification.

## Technical Notes

* `src/stores/terminalStore.ts`: `shouldEnableHookEnv` currently depends on `detectCliHookTool(title, startupCmd)`.
* `src-tauri/src/commands/terminal.rs`: `pty_create` injects hook bridge env only when `hookEnvEnabled` is true.
* `src-tauri/src/commands/hook_settings.rs`: hook scripts require `CLI_MANAGER_TAB_ID`, `CLI_MANAGER_NOTIFY_PORT`, `CLI_MANAGER_NOTIFY_TOKEN`.
* `src-tauri/src/pty/manager.rs`: Git Bash shell runtime injection exists; WSL shell runtime injection is explicitly not reliable.
* Relevant specs: backend terminal runtime monitoring contracts, frontend state management/quality guidelines, cross-layer thinking guide.
