# Component Guidelines

> How components are built in this project.

---

## Overview

(To be filled by the team)

---

## Component Structure

### Convention: Keep settings tab ids stable when only renaming UI labels

**What**: In `SettingsModal`, `SettingsTab` ids are part of the internal navigation contract. When a change only renames or reorganizes a settings page, keep the existing tab id and update only the visible label/title/description.

**Why**: Settings tabs are passed through props such as `onOpenSettings(tab?: SettingsTab)`. Renaming an id like `"terminal-theme"` to `"terminal-settings"` creates unnecessary type and call-site churn without changing persisted settings or runtime behavior.

**Example**:

```tsx
// Good: stable id, renamed UI copy only
const SETTINGS_TAB_CONFIG = {
  "terminal-theme": {
    label: "终端设置",
    title: "终端设置",
  },
};

// Bad: id churn for a display-only rename
type SettingsTab = "general" | "terminal-settings" | "shortcuts";
```

**Tests**: After changing settings page labels or layout, assert that existing callers can still open the page through the old `SettingsTab` literal and run `npx tsc --noEmit`.

### Convention: Settings top search appears only for tabs with real filtering

**What**: In `SettingsModal`, set `searchPlaceholder` only for tabs whose page consumes `searchValue` to filter visible content. For tabs without filtering, omit `searchPlaceholder` and let `SettingsTopBar` render only the close button.

**Why**: A placeholder like "搜索通用设置（预留）" makes an unfinished feature look interactive. Optional `searchPlaceholder` keeps real search working for pages such as shortcuts/templates without showing dead controls on static settings pages.

**Example**:

```tsx
// Good: only pages with real filtering expose search
const SETTINGS_TAB_CONFIG = {
  shortcuts: { label: "快捷键", searchPlaceholder: "搜索快捷键" },
  hooks: { label: "Hook 设置" },
};

// Good: top bar treats search as optional
{searchPlaceholder && <Input value={searchValue} placeholder={searchPlaceholder} />}

// Bad: reserved search that does not filter anything
const hooks = { label: "Hook 设置", searchPlaceholder: "搜索 Hook 设置（预留）" };
```

**Tests**: After changing settings search behavior, run `npx tsc --noEmit` and manually verify searchable tabs still filter while static tabs do not show a search input.

### Convention: Terminal tab drag uses overlay plus explicit pane drop zones

**What**: Terminal tab drag interactions use dnd-kit `DragOverlay` for the cursor-following tab, while pane movement/splitting is driven by explicit drop ids:

```typescript
type TerminalPaneDropEdge = "left" | "right" | "top" | "bottom";
type PaneDropTarget =
  | { type: "center"; paneId: string }
  | { type: "edge"; paneId: string; edge: TerminalPaneDropEdge };
```

**Why**: sortable tab transforms are optimized for in-list reordering and can visually lock a tab to the tab bar. Pane-level drop zones make center move and edge split behavior testable without guessing from DOM position after drop.

**Correct**:

```tsx
<DndContext collisionDetection={terminalTabCollisionDetection}>
  <SplitTerminalView node={paneTree} renderLeaf={renderLeaf} />
  <DragOverlay dropAnimation={null}>{activeTabOverlay}</DragOverlay>
</DndContext>
```

**Wrong**:

```tsx
// Do not infer pane splits from tab bar reorder transforms only.
const horizontalTransform = transform ? { ...transform, y: 0 } : transform;
```

**Tests**: For terminal drag UI changes, run `npx tsc --noEmit` and manually verify same-pane reorder, pane-center move, and left/right/top/bottom edge split previews in the Tauri desktop app.

---

## Props Conventions

(To be filled by the team)

---

## Styling Patterns

(To be filled by the team)

---

## Accessibility

(To be filled by the team)

---

## Common Mistakes

### Gotcha: xterm.js `allowTransparency` is a construction-time option

**Symptom**: After toggling a "transparent background" feature on a live `Terminal` instance, the background stays opaque even though `theme.background` was updated to `rgba(...)`.

**Cause**: Per `node_modules/@xterm/xterm/typings/xterm.d.ts`:

> `allowTransparency` must be set before executing the `Terminal.open()` method and can't be changed later without executing it again.

If you write `terminal.options.allowTransparency = true` at runtime, the option silently does nothing.

**Wrong**:

```tsx
const terminal = new Terminal({ /* ...no allowTransparency... */ });
// Later, when user enables background image:
terminal.options.allowTransparency = true;        // ❌ no-op
terminal.options.theme = { background: "rgba(0,0,0,0)" };  // ❌ still opaque rendering
```

**Correct**:

```tsx
const terminal = new Terminal({
  // ...
  allowTransparency: true,   // ✅ set once, unconditionally
  theme: getInitialTheme(),
});
// Later, swap only theme.background between opaque HEX and rgba:
terminal.options.theme = isTransparent ? applyTransparency(theme) : theme;
```

**Why "always on" instead of "rebuild the Terminal on toggle"**: Rebuilding loses scrollback, breaks the PTY data stream wiring, and incurs ~50 ms of GPU/font setup. xterm's WebglAddon is alpha-capable (`alpha: true` is the default WebGL context flag), so the cost of `allowTransparency: true` is a small constant per-frame — research measured ~5-10% FPS in pathological cases, imperceptible in normal terminal use.

**Reference**: `src/components/XTermTerminal.tsx` — sets `allowTransparency: true` unconditionally; the hot-update `useEffect` only swaps `terminal.options.theme` via `applyTransparency` helper in `src/lib/terminalThemes.ts`.

**Prevention checklist when wiring a new xterm appearance feature**:

- [ ] Does the feature need a non-opaque background, an alternate cursor blink, or any other "must-set-at-construction" xterm option?
- [ ] If yes, set it unconditionally at `new Terminal(...)` — do NOT gate it on the feature toggle.
- [ ] Read the JSDoc on every option you set; xterm marks construction-time options explicitly.
- [ ] When in doubt, grep `typings/xterm.d.ts` for "can't be changed later" / "must be set before".

### Common Mistake: Recreating the Terminal on settings change

**Symptom**: Toggling a terminal-related setting (font family change, background enable) causes the terminal to flash blank, lose scrollback, and re-prompt.

**Cause**: The construction `useEffect` lists a settings field in its dependency array, so changing that field disposes and recreates the Terminal.

**Fix**: Keep the construction effect's deps as `[sessionId]`. Add a separate hot-update effect that mutates `terminal.options.*` for the changed setting. xterm supports hot-mutating `fontSize`, `fontFamily`, `theme`, `cursorBlink`, `cursorStyle`, `scrollback` without rebuild. Only `allowTransparency`, `cols`/`rows` (use Fit instead), and `rendererType` (legacy) require rebuild.

### Common Mistake: Treating `cursorBlink` as full cursor visibility control

**Symptom**: A TUI such as Codex still shows rapid cursor flashing after `cursorBlink` is set to `false`.

**Cause**: `cursorBlink` only controls xterm's own blink animation. Terminal applications can still emit DECTCEM sequences (`CSI ?25h` show cursor, `CSI ?25l` hide cursor), and xterm honors those independently while processing PTY output.

**Wrong**:

```tsx
const terminal = new Terminal({
  cursorBlink: false,
});
// Assumes this also suppresses application-driven show/hide cursor churn.
```

**Correct**:

```tsx
if (sequence === "\x1b[?25l") {
  cancelPendingCursorShow();
  writeNow(sequence);
} else if (sequence === "\x1b[?25h") {
  scheduleCursorShow();
}
```

**Prevention**: For high-frequency TUI redraw issues, inspect application-emitted ANSI cursor visibility sequences before changing xterm appearance options. Pass hide through immediately, debounce show, and keep output processing in the PTY write path instead of adding CLI-specific UI state.

### Convention: xterm Windows PTY and paste handling

**What**: Internal xterm instances backed by the app's Windows PTY must use xterm's Windows compatibility and native paste path.

**Why**: ConPTY resize/reflow can make PowerShell output appear to vanish after fit/tab changes. Custom paste handlers that write directly to `pty_write` bypass xterm's CR normalization and bracketed paste markers, so TUIs such as Claude Code may treat multi-line paste as typed Enter events.

**Correct**:

```tsx
const terminal = new Terminal({
  scrollOnEraseInDisplay: true,
  windowsPty: { backend: "conpty" },
});

const pasteIntoTerminal = (text: string) => {
  terminal.paste(text);
};

terminal.onData((data) => {
  invoke("pty_write", { sessionId, data });
  // If command history needs pasted text, strip complete bracketed-paste
  // wrappers only for history; never rewrite data before sending it to PTY.
});
```

**Wrong**:

```tsx
const data = text.replace(/\r\n?/g, "\n");
invoke("pty_write", { sessionId, data });
```

**Tests / manual checks**:

- [ ] Windows 10 + PowerShell retains scrollback after tab switch / resize / fit.
- [ ] Claude Code multi-line paste preserves line order and is not submitted line-by-line.
- [ ] CMD still accepts normal paste and Enter behavior.

