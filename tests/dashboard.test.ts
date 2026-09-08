import { expect, test } from "bun:test";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, type Component, type KeyId } from "@earendil-works/pi-tui";
import { registerSessionsCommand, type SessionsDeps } from "../src/extension/index";
import { demoOverview } from "../src/demo";
import type { HistoryProgress } from "../src/history/reader";

async function dashboard(deps: SessionsDeps, keys: string[][], onLoading?: (component: Component, output: string) => void) {
  let handler!: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
  const pages: string[] = [], loading: string[] = [];
  const actions: Record<string, KeyId> = { "tui.select.cancel": "escape", "tui.select.confirm": "enter", "tui.select.down": "down", "tui.select.up": "up" };
  const pi = { registerCommand(_name: string, command: { handler: typeof handler }) { handler = command.handler; } } as unknown as ExtensionAPI;
  registerSessionsCommand(pi, { pins: { isPinned: () => false, setPinned() {} }, now: () => 1000, ...deps });
  const ctx = { mode: "tui", hasUI: true, ui: {
    notify() {}, select: async () => "Back",
    custom: (factory: (...args: any[]) => Component) => new Promise((resolve, reject) => {
      try {
        const component = factory({ terminal: { rows: 24 }, requestRender() {} }, { fg: (_: string, s: string) => s },
          { matches: (data: string, action: string) => actions[action] ? matchesKey(data, actions[action]) : false }, resolve);
        const output = component.render(120).join("\n");
        if (output.includes("Refreshing running sessions") || output.includes("Loading saved sessions") || output.includes("Refreshing saved sessions")) { loading.push(output); onLoading?.(component, output); return; }
        pages.push(output);
        for (const key of keys.shift() ?? ["\u001b"]) component.handleInput?.(key);
      } catch (error) { reject(error); }
    }),
  } } as unknown as ExtensionCommandContext;
  await handler("", ctx);
  return { pages, loading };
}

test("Running selection survives details, reordering refresh, and a tab round trip", async () => {
  let scans = 0;
  const initial = demoOverview(); initial.sessions = initial.sessions.slice(0, 2);
  const reordered = { ...initial, sessions: [...initial.sessions].reverse() };
  const result = await dashboard({ overview: () => ++scans === 1 ? initial : reordered, history: async () => ({ sessions: [], warnings: [] }) },
    [["\u001b[B", "\r"], ["r"], ["\t"], ["\t"], ["\u001b"]]);
  for (const index of [1, 2, 4]) expect(result.pages[index]?.split("\n").find((s) => s.startsWith("→"))).toContain("Review workspace");
  expect(result.loading[1]).toContain("Review workspace");
  expect(result.loading[1]).toContain("Build playback");
});

test("switching away from an in-flight Recent load restores Running and ignores late results", async () => {
  let component!: Component;
  let complete!: (value: { sessions: []; warnings: string[] }) => void;
  let signal!: AbortSignal;
  const result = await dashboard({ overview: demoOverview, history: (options) => {
    signal = options!.signal!;
    return new Promise((resolve) => {
      complete = resolve;
      component.handleInput?.("\t");
    });
  } }, [["\u001b[B", "\t"], ["\t"], ["\u001b"]], (c, output) => {
    if (output.includes("Loading saved sessions")) component = c;
  });
  expect(signal.aborted).toBe(true);
  expect(result.pages[1]).toContain("[Running]");
  expect(result.pages[1]?.split("\n").find((line) => line.startsWith("→"))).toContain("Review workspace");
  expect(result.pages[2]).toContain("[Recent]");
  expect(result.pages[2]).toContain("Loading cancelled");
  complete({ sessions: [], warnings: ["late result"] });
  await Promise.resolve();
  expect(result.pages.join("\n")).not.toContain("late result");
});

test("refresh failure retains rows, selection, and prior timestamp with retry notice", async () => {
  let scans = 0;
  const result = await dashboard({ overview: () => { if (++scans > 1) throw Error("private failure"); return demoOverview(); } },
    [["\u001b[B", "r"], ["\u001b"]]);
  expect(result.pages[1]).toContain("Refresh failed");
  expect(result.pages[1]).toContain("Updated just now");
  expect(result.pages[1]).toContain("Review workspace");
  expect(result.pages[1]?.split("\n").find((s) => s.startsWith("→"))).toContain("Review workspace");
  expect(result.pages.join(" ")).not.toContain("private failure");
});

test("Show more focuses the first new identity and a failed history refresh retains rows", async () => {
  let reads = 0;
  const sessions = Array.from({ length: 21 }, (_, i) => ({ sessionId: `saved-${i}`, sessionFile: `/fixture/${i}`, cwd: "/fixture", name: `Task-${i}`, modifiedAt: new Date(1000 - i).toISOString() }));
  const result = await dashboard({ overview: demoOverview, history: async () => {
    if (++reads > 1) return { sessions: [], warnings: ["unreadable"], failed: true };
    return { sessions, warnings: [] };
  } }, [["\t"], ["m"], ["r"], ["\u001b"]]);
  expect(result.pages[2]?.split("\n").find((s) => s.startsWith("→"))).toContain("Task-15");
  expect(result.pages[3]).toContain("Refresh failed");
  expect(result.pages[3]).toContain("21 of 21");
  expect(result.loading.at(-1)).toContain("Task-15");
});

test("Recent retry starts a fresh scan and ignores a cancelled reader's late progress and results", async () => {
  let reads = 0;
  let component!: Component;
  let finishOld!: (value: { sessions: []; warnings: string[] }) => void;
  let reportOld: ((progress: HistoryProgress) => void) | undefined;
  const result = await dashboard({ overview: demoOverview, history: async (options) => {
    if (++reads === 1) {
      reportOld = options?.onProgress;
      return new Promise((resolve) => { finishOld = resolve; component.handleInput?.("\u001b"); });
    }
    options?.onProgress?.({ phase: "scanning", files: 3, sessions: 1, directories: 2 });
    expect(component.render(120).join("\n")).toContain("3 files checked");
    reportOld?.({ phase: "scanning", files: 999, sessions: 999, directories: 999 });
    finishOld({ sessions: [], warnings: ["late warning"] });
    expect(component.render(120).join("\n")).not.toContain("999");
    return { sessions: [{ sessionId: "fresh", sessionFile: "/fixture/fresh", cwd: "/fixture", name: "Fresh result", modifiedAt: new Date(1000).toISOString() }], warnings: [] };
  } }, [["\t"], ["r"], ["\u001b"]], (c, output) => {
    if (output.includes("Loading saved sessions")) component = c;
  });
  expect(reads).toBe(2);
  expect(result.pages[1]).toContain("Loading cancelled");
  expect(result.pages[1]).toContain("r Refresh to retry");
  expect(result.pages[1]).not.toContain("0 of 0");
  expect(result.pages[2]).toContain("Fresh result");
  expect(result.pages[2]).not.toContain("Loading cancelled");
  expect(result.pages.join("\n")).not.toContain("late warning");
});
