import { expect, test } from "bun:test";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { loadSessionPage, rowColumns, selectSessionPage, selectionIndex, showDiscoveryDetails, type SessionPage } from "../src/extension/picker";

const page = (): SessionPage => ({ tab: "Running", now: 1000, updatedAt: 1000, summary: "20 running · 18 connected", empty: "No sessions",
  warnings: ["Long warning ".repeat(80)], actions: ["Refresh", "Discovery details", "Close"],
  rows: Array.from({ length: 20 }, (_, i) => ({ id: `id-${i}`, project: "project", name: `Session ${i}`, meta: "Working · model" })) });

function host(script: (component: Component) => void | Promise<void>, height = 24) {
  return { mode: "tui", ui: { custom: (factory: (...args: any[]) => Component) => new Promise((resolve, reject) => {
    const component = factory({ terminal: { rows: height }, requestRender() {} }, { fg: (_color: string, s: string) => s }, {
      matches: (data: string, action: string) => {
        const keys: Record<string, string> = { "tui.select.cancel": "escape", "tui.select.confirm": "enter", "tui.select.up": "up", "tui.select.down": "down", "tui.select.pageUp": "pageUp", "tui.select.pageDown": "pageDown" };
        return action in keys && matchesKey(data, keys[action] as "escape");
      },
    }, resolve);
    component.render(100);
    void Promise.resolve(script(component)).catch(reject);
  }) } } as unknown as ExtensionCommandContext;
}

test("tabs, fixed summaries/actions, responsive Unicode rows, and injected selection", async () => {
  const p = page(); p.selectedId = "id-10";
  let focus = "";
  const ctx = host((component) => {
    for (const width of [16, 40, 80, 120]) {
      const lines = component.render(width);
      expect(lines.length).toBeLessThanOrEqual(22);
      for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(width);
    }
    const output = component.render(100).join("\n");
    expect(output).toContain("[Running]   Recent");
    expect(output).toContain("Session 10");
    expect(output).toContain("Updated just now");
    expect(output).not.toContain("Long warning");
    component.handleInput?.("\u001b[B"); component.handleInput?.("\r");
  });
  expect(await selectSessionPage(ctx, p, (id) => { focus = id; })).toBe("id-11");
  expect(focus).toBe("id-11");
  expect(selectionIndex([...p.rows].reverse(), "id-10")).toBe(9);
  expect(selectionIndex(p.rows, "gone")).toBe(0);
});

test("narrow rows prioritize names and neutralize terminal bytes", () => {
  const row = { id: "x", project: "project", name: "会話 👩‍💻\u001b[31m", meta: "secondary-metadata", pinned: true };
  for (const width of [0, 4, 20, 50, 100]) {
    const output = rowColumns(row, width);
    expect(visibleWidth(output)).toBeLessThanOrEqual(width);
    expect(output).not.toContain("\u001b[31m"); // TUI-generated reset sequences are safe.
    if (width === 20) { expect(output).toContain("会話"); expect(output).not.toContain("project"); }
  }
});

test("PID survives long model names and session columns do not stretch with the terminal", async () => {
  const p = page();
  p.rows = [
    { id: "one", project: "会話", name: "Short", meta: "Working · " + "long-model-".repeat(20), pid: "PID 4194304", pinned: true },
    { id: "two", project: "project", name: "Session two", meta: "Idle · model", pid: "PID 42" },
  ];
  await selectSessionPage(host((component) => {
    for (const width of [46, 60, 79, 80, 100, 160, 240]) {
      const lines = component.render(width);
      for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      const first = lines.find((line) => line.includes("Short"))!;
      const second = lines.find((line) => line.includes("Session two"))!;
      expect(first).toContain("PID 4194304");
      expect(second).toContain("PID 42");
      const position = (line: string, text: string) => visibleWidth(line.slice(0, line.indexOf(text)));
      expect(position(first, "PID")).toBe(position(second, "PID"));
      if (width >= 80) {
        const header = lines.find((line) => line.includes("Status · Model"))!;
        expect(position(first, "Working")).toBe(position(header, "Status"));
        expect(position(first, "PID")).toBe(position(header, "PID"));
        expect(position(first, "Working") - position(first, "Short") - "Short".length).toBe(8);
      }
    }
    component.handleInput?.("\u001b");
  }), p, () => {});
});

test("Recent columns stay content-sized and never show a PID column", async () => {
  const p = { ...page(), tab: "Recent" as const, rows: [
    { id: "saved", project: "project", name: "Saved session", meta: "saved just now", savedAt: new Date(1000).toISOString() },
  ] };
  await selectSessionPage(host((component) => {
    const lines = component.render(240);
    expect(lines.join("\n")).not.toContain("PID");
    expect(lines.find((line) => line.includes("Saved session"))).toContain("Saved session  saved just now");
    component.handleInput?.("\u001b");
  }), p, () => {});
});

test("RPC labels retain the separate PID", async () => {
  const p = page(); p.rows = [{ id: "one", project: "project", name: "Session", meta: "Idle", pid: "PID 1234567" }];
  const ctx = { mode: "rpc", ui: { select: async (_title: string, labels: string[]) => {
    expect(labels[0]).toContain("Idle · PID 1234567");
    return labels[0];
  } } } as unknown as ExtensionCommandContext;
  expect(await selectSessionPage(ctx, p, () => {})).toBe("one");
});

test("TUI tabs, escape, and action shortcuts return stable values", async () => {
  for (const [key, expected] of [["\t", "Recent"], ["r", "Refresh"], ["c", "Discovery details"], ["\u001b", undefined]] as const) {
    expect(await selectSessionPage(host((c) => c.handleInput?.(key)), page(), () => {})).toBe(expected);
  }
});

test("short terminals retain tabs and actions without exceeding available height", async () => {
  const p = { ...page(), tab: "Recent" as const, actions: ["Show more", "Pinned only", "Refresh", "Discovery details", "Close"] };
  for (const height of [8, 10, 12, 20]) {
    await selectSessionPage(host((component) => {
      for (const width of [16, 32, 80]) {
        const lines = component.render(width);
        expect(lines.length).toBeLessThanOrEqual(Math.max(5, height - 2));
        expect(lines[0]).toContain("[Recent]");
        expect(lines.join("\n")).toContain("Esc");
      }
      component.handleInput?.("\u001b");
    }, height), p, () => {});
  }
});

test("loading renders previous rows, propagates cancellation, and ignores late completion", async () => {
  let resolve!: (value: string) => void;
  let signal!: AbortSignal;
  const result = await loadSessionPage(host(async (component) => {
    expect(component.render(100).join("\n")).toContain("Loading saved sessions");
    expect(component.render(100).join("\n")).toContain("Session 0");
    await new Promise((done) => setTimeout(done, 10));
    component.handleInput?.("\u001b");
  }), page(), "Loading saved sessions…", (s) => { signal = s; return new Promise((r) => { resolve = r; }); });
  expect(result).toEqual({ status: "cancelled" });
  expect(signal.aborted).toBe(true);
  resolve("late");
  await Promise.resolve();
});

test("load success and failure settle without leaking rejected work", async () => {
  const ctx = host(() => {});
  expect(await loadSessionPage(ctx, page(), "Loading", async () => 42)).toEqual({ status: "ok", value: 42 });
  expect(await loadSessionPage(ctx, page(), "Loading", async () => { throw Error("secret"); })).toEqual({ status: "error" });
});

test("loading accepts row navigation and tab switching without waiting for the reader", async () => {
  for (const key of ["\t", "\u001b[Z", "\u001b[D", "\u001b[C"]) {
    let signal!: AbortSignal;
    let complete!: (value: number) => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    let focused = "";
    const p = { ...page(), tab: "Recent" as const };
    const result = await loadSessionPage(host(async (component) => {
      await ready;
      component.handleInput?.("\u001b[B");
      expect(focused).toBe("id-1");
      expect(component.render(100).find((line) => line.startsWith("→"))).toContain("Session 1");
      component.handleInput?.(key);
    }), p, "Loading saved sessions…", (s) => {
      signal = s; started();
      return new Promise<number>((resolve) => { complete = resolve; });
    }, (id) => { focused = id; });
    expect(result).toEqual({ status: "navigate", tab: "Running" });
    expect(signal.aborted).toBe(true);
    complete(42); // A late, non-cooperative reader cannot publish its result.
    await Promise.resolve();
  }
});

test("switching tabs before the first load starts never invokes the reader", async () => {
  let called = false;
  const result = await loadSessionPage(host((component) => component.handleInput?.("\t")),
    page(), "Loading", async () => { called = true; });
  expect(result).toEqual({ status: "navigate", tab: "Recent" });
  expect(called).toBe(false);
});

test("RPC cancellation aborts work and retains a metadata snapshot in the loading dialog", async () => {
  let signal!: AbortSignal;
  let title = "";
  const ctx = { mode: "rpc", ui: { select: async (text: string) => { title = text; return "Cancel loading"; } } } as unknown as ExtensionCommandContext;
  const result = await loadSessionPage(ctx, page(), "Loading", (s) => { signal = s; return new Promise(() => {}); });
  expect(result.status).toBe("cancelled");
  expect(signal.aborted).toBe(true);
  expect(title).toContain("Session 0");
});

test("display age advances on repaint without discovering or changing snapshots", async () => {
  let now = 1000;
  const p = { ...page(), clock: () => now };
  await selectSessionPage(host((component) => {
    expect(component.render(100).join("\n")).toContain("Updated just now");
    now += 120_000;
    expect(component.render(100).join("\n")).toContain("Updated 2 minutes ago");
    component.handleInput?.("\u001b");
  }), p, () => {});
});

test("discovery details are scrollable and bounded on short terminals", async () => {
  const ctx = host((component) => {
    const first = component.render(30);
    expect(first.length).toBeLessThanOrEqual(10);
    for (let i = 0; i < 8; i++) component.handleInput?.("\u001b[B");
    expect(component.render(30)).not.toEqual(first);
    component.handleInput?.("\u001b");
  }, 12);
  await showDiscoveryDetails(ctx, page());
});

test("only actual scan warnings get a dashboard indicator", async () => {
  for (const warnings of [[], ["Unreadable file"], ["Unreadable file", "Scan limit reached"]]) {
    await selectSessionPage(host((component) => {
      const output = component.render(120).join("\n");
      expect(output).toContain("c Discovery details");
      expect(output).not.toContain("coverage notes");
      if (warnings.length) expect(output).toContain(`${warnings.length} scan warning${warnings.length === 1 ? "" : "s"} · c details`);
      else expect(output).not.toContain("scan warning");
      component.handleInput?.("\u001b");
    }), { ...page(), warnings }, () => {});
  }
});

test("discovery details share tab-specific sections in RPC and keep headings fixed in TUI", async () => {
  let rpc = "";
  await showDiscoveryDetails({ mode: "rpc", ui: { select: async (title: string) => { rpc = title; } } } as unknown as ExtensionCommandContext,
    { ...page(), tab: "Recent", warnings: [] });
  expect(rpc).toContain("Recent · Discovery details");
  expect(rpc).toContain("Scan results\nNo scan warnings reported");
  expect(rpc).toContain("How Recent works");
  expect(rpc).not.toContain("How Running works");
  await showDiscoveryDetails(host((component) => {
    const first = component.render(50);
    component.handleInput?.("\u001b[6~"); // Page down.
    const next = component.render(50);
    expect(next[0]).toBe(first[0]);
    expect(next).not.toEqual(first);
    expect(next.at(-1)).toContain("Esc / Enter back");
    component.handleInput?.("\u001b[5~");
    expect(component.render(50)).toEqual(first);
    component.handleInput?.("\r");
  }, 12), page());
});
