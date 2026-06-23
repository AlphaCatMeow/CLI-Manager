import { useSettingsStore } from "../stores/settingsStore";

function getCloseTerminalConfirmMessage(sessionCount: number): string {
  const target = sessionCount > 1 ? `${sessionCount} \u4e2a\u7ec8\u7aef\u6807\u7b7e\u9875` : "\u7ec8\u7aef\u6807\u7b7e\u9875";
  return `\u786e\u5b9a\u8981\u5173\u95ed${target}\u5417\uff1f\n\n\u5173\u95ed\u540e\u5bf9\u5e94\u7ec8\u7aef\u8fdb\u7a0b\u4f1a\u88ab\u7ed3\u675f\u3002`;
}

export function confirmTerminalTabClose(sessionCount = 1): boolean {
  if (sessionCount <= 0) return false;
  if (!useSettingsStore.getState().confirmBeforeClosingTerminalTab) return true;
  return window.confirm(getCloseTerminalConfirmMessage(sessionCount));
}
