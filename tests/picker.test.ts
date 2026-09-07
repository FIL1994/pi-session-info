import { expect, test } from "bun:test";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { selectSessionPage } from "../src/extension/picker";

test("TUI renders actual tabs and supports switching, selecting, and dismissal", async () => {
  for (const [key, expected] of [["\t", "Recent"], ["\u001b[C", "Recent"], ["\r", "Session A"], ["\u001b", undefined]] as const) {
    const ctx = { mode: "tui", ui: { custom: async (factory: (
      tui: object, theme: object, kb: object, done: (value: string | undefined) => void,
    ) => Component) => {
      let result: string | undefined;
      const component = factory({ requestRender() {} }, { fg: (_color: string, s: string) => s }, {
        matches: (data: string, action: string) => (action === "tui.select.cancel" && matchesKey(data, "escape")) || (action === "tui.select.confirm" && matchesKey(data, "enter")),
      }, (value) => { result = value; });
      expect(component.render(80).join("\n")).toContain("[Running]   Recent");
      component.invalidate();
      for (const line of component.render(20)) expect(visibleWidth(line)).toBeLessThanOrEqual(20);
      component.handleInput?.(key);
      return result;
    } } } as unknown as ExtensionCommandContext;
    expect(await selectSessionPage(ctx, "Running", "Snapshot", ["Session A", "Close"])).toBe(expected);
  }
});

test("TUI focuses newly revealed rows and honors injected navigation bindings", async () => {
  const choices = Array.from({ length: 20 }, (_, i) => `Session ${i}`);
  const ctx = { mode: "tui", ui: { custom: async (factory: (
    tui: object, theme: object, kb: object, done: (value: string | undefined) => void,
  ) => Component) => {
    let result: string | undefined;
    const component = factory({ requestRender() {} }, { fg: (_color: string, s: string) => s }, {
      matches: (data: string, action: string) => (data === "j" && action === "tui.select.down") || (data === "x" && action === "tui.select.confirm"),
    }, (value) => { result = value; });
    expect(component.render(80).join("\n")).toContain("→ Session 10");
    component.handleInput?.("j");
    component.handleInput?.("x");
    return result;
  } } } as unknown as ExtensionCommandContext;
  expect(await selectSessionPage(ctx, "Recent", "Saved sessions", choices, 10)).toBe("Session 11");
});
