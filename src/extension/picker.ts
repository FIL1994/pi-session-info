import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, SelectList, Text, truncateToWidth } from "@earendil-works/pi-tui";

export type SessionsTab = "Running" | "Recent";

/** Native tabs in TUI; equivalent navigation options for RPC clients. */
export async function selectSessionPage(ctx: ExtensionCommandContext, tab: SessionsTab, title: string, choices: string[], initialIndex = 0) {
  const other = tab === "Running" ? "Recent" : "Running";
  if (ctx.mode !== "tui") return ctx.ui.select(`${tab === "Running" ? "[Running]  Recent" : "Running  [Recent]"}\n${title}`, [...choices, other]);
  return ctx.ui.custom<string | undefined>((tui, theme, kb, done) => {
    let selected = Math.max(0, Math.min(initialIndex, choices.length - 1));
    const list = new SelectList(choices.map((label) => ({ value: label, label })), 12, {
      selectedPrefix: (s) => theme.fg("accent", s), selectedText: (s) => theme.fg("accent", s),
      description: (s) => theme.fg("muted", s), scrollInfo: (s) => theme.fg("dim", s),
      noMatch: (s) => theme.fg("muted", s),
    });
    list.setSelectedIndex(selected);
    list.onSelect = (item) => done(item.value);
    list.onCancel = () => done(undefined);
    return {
      render(width) {
        const tabs = ["Running", "Recent"].map((name) => name === tab ? theme.fg("accent", `[${name}]`) : theme.fg("muted", name)).join("   ");
        return [truncateToWidth(tabs, width), ...new Text(title, 0, 0).render(width), "",
          ...list.render(width), "", truncateToWidth("Tab / ← → switch tabs · ↑↓ select · Enter details · Esc close", width)];
      },
      invalidate() { list.invalidate(); },
      handleInput(data) {
        if (matchesKey(data, "tab") || matchesKey(data, "shift+tab") || matchesKey(data, "left") || matchesKey(data, "right")) done(other);
        else if (kb.matches(data, "tui.select.cancel")) done(undefined);
        else if (kb.matches(data, "tui.select.confirm")) done(choices[selected]);
        else {
          if (kb.matches(data, "tui.select.up")) selected = (selected + choices.length - 1) % choices.length;
          if (kb.matches(data, "tui.select.down")) selected = (selected + 1) % choices.length;
          if (kb.matches(data, "tui.select.pageUp")) selected = Math.max(0, selected - 10);
          if (kb.matches(data, "tui.select.pageDown")) selected = Math.min(choices.length - 1, selected + 10);
          list.setSelectedIndex(selected);
        }
        tui.requestRender();
      },
    };
  });
}
