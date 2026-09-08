import { expect, test } from "bun:test";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { registerSessionsCommand } from "../src/extension/index";
import { demoOverview } from "../src/demo";
import type { HistorySnapshot } from "../src/history/reader";
import type { PinStore } from "../src/pins";

function setup(choices: (string | undefined)[] = ["Close"], fail = false, history: () => Promise<HistorySnapshot> = async () => ({ sessions: [], warnings: [] }), pins: PinStore = { isPinned: () => false, setPinned: () => {} }) {
  let handler!: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
  const dialogs: { title: string; choices: string[] }[] = [];
  const notifications: string[] = [];
  let scans = 0;
  const pi = { registerCommand(name: string, command: { handler: typeof handler }) {
    expect(name).toBe("sessions"); handler = command.handler;
  } } as unknown as ExtensionAPI;
  registerSessionsCommand(pi, { pins, history, pid: -1, overview: () => { scans++; if (fail) throw Error("fixture error"); return demoOverview(); } });
  const ctx = { hasUI: true, ui: {
    select: async (title: string, options: string[]) => { dialogs.push({ title, choices: options }); const choice = choices.shift(); return choice === "first" ? options[0] : choice; },
    notify: (message: string) => notifications.push(message),
  } } as unknown as ExtensionCommandContext;
  return { run: (args = "") => handler(args, ctx), ctx, dialogs, notifications, scans: () => scans };
}

test("sessions picker closes on Close or Escape without sending model messages", async () => {
  for (const choice of ["Close", undefined]) {
    const app = setup([choice]); await app.run();
    expect(app.dialogs).toHaveLength(1);
    expect(app.dialogs[0]?.choices.join(" ")).toContain("Not connected");
    expect(app.notifications).toEqual([]);
  }
});

const saved = Array.from({ length: 25 }, (_, i) => ({
  sessionId: `saved-${i}`, sessionFile: `/synthetic/${i}.jsonl`, cwd: "/synthetic/project",
  name: `Task ${i}`, modifiedAt: new Date(1_000_000 - i * 1000).toISOString(),
}));

test("Recent starts at ten, Show more adds ten, and history is cached until refresh", async () => {
  let reads = 0;
  const app = setup(["Recent", "Show more", "Show more", "Refresh", "Running", "Close"], false, async () => {
    reads++; return { sessions: saved, warnings: [] };
  });
  await app.run();
  expect(reads).toBe(2);
  expect(app.dialogs[1]?.title).toContain("10 of 25");
  expect(app.dialogs[2]?.title).toContain("20 of 25");
  expect(app.dialogs[3]?.title).toContain("25 of 25");
  expect(app.dialogs[3]?.choices).not.toContain("Show more");
  expect(app.dialogs[5]?.title).toContain("[Running]");
});

test("Running does not read history", async () => {
  let reads = 0;
  const app = setup(["Refresh", "Close"], false, async () => { reads++; throw Error("must not read"); });
  await app.run();
  expect(reads).toBe(0);
});

test("Recent details are read-only metadata and escape control bytes", async () => {
  const app = setup(["Recent", "first", "Back", "Close"], false, async () => ({
    sessions: [{ ...saved[0]!, name: "Task\u001b[31m" }], warnings: [],
  }));
  await app.run();
  expect(app.dialogs[1]?.choices[0]).toContain("\\u001b");
  expect(app.dialogs[2]?.title).toContain("File: /synthetic/0.jsonl");
  expect(app.dialogs[2]?.title).not.toContain("\u001b");
  expect(app.dialogs[2]?.title).not.toContain("unknown");
});

test("Recent errors and empty history retain navigation and retry", async () => {
  let reads = 0;
  const app = setup(["Recent", "Refresh", "Running", "Close"], false, async () => {
    if (++reads === 1) throw Error("secret disk error");
    return { sessions: [], warnings: [] };
  });
  await app.run();
  expect(app.dialogs[1]?.title).toContain("Could not load sessions");
  expect(app.dialogs[1]?.title).not.toContain("secret");
  expect(app.dialogs[2]?.title).toContain("No recent saved sessions found");
  expect(app.dialogs[2]?.choices).not.toContain("Show more");
});

test("Recent excludes the viewer's session before selecting the first ten", async () => {
  const app = setup(["Recent", "Close"], false, async () => ({ sessions: saved.slice(0, 11), warnings: [] }));
  app.ctx.sessionManager = {
    getSessionId: () => "saved-0", getSessionFile: () => "/synthetic/0.jsonl", getSessionDir: () => "/synthetic",
  } as unknown as ExtensionCommandContext["sessionManager"];
  await app.run();
  expect(app.dialogs[1]?.title).toContain("10 of 10");
  expect(app.dialogs[1]?.choices.join("\n")).not.toContain("Task 0 ·");
  expect(app.dialogs[1]?.choices.join("\n")).toContain("Task 10 ·");
  expect(app.dialogs[1]?.choices).not.toContain("Show more");
});

test("pin/unpin changes only extension metadata and Pinned only updates immediately", async () => {
  const ids = new Set<string>();
  const pins = { isPinned: (id: string) => ids.has(id), setPinned: (id: string, value: boolean) => { if (value) ids.add(id); else ids.delete(id); } };
  const app = setup(["Recent", "first", "Pin session", "Pinned only", "first", "Unpin session", "Close"], false,
    async () => ({ sessions: saved, warnings: [] }), pins);
  await app.run();
  expect(app.dialogs[3]?.choices[0]).toContain("★");
  expect(app.dialogs[4]?.title).toContain("Pinned · 1 of 1");
  expect(app.dialogs[5]?.choices).toContain("Unpin session");
  expect(app.dialogs[6]?.title).toContain("No pinned sessions available");
  expect(ids.size).toBe(0);
  expect(app.dialogs[1]?.choices).toContain("Coverage details");
  expect(app.notifications).toEqual(["Session pinned.", "Session unpinned."]);
  expect(app.dialogs[2]?.title).toContain(saved[0]!.modifiedAt);
  expect(app.dialogs[1]?.choices[0]).toContain("saved ");
  expect(app.dialogs[1]?.choices[0]).not.toContain(saved[0]!.modifiedAt);
});

test("Pinned only filters before pagination and still excludes the current session", async () => {
  const app = setup(["Recent", "Pinned only", "Close"], false, async () => ({ sessions: saved, warnings: [] }),
    { isPinned: (id) => id === "saved-24" || id === "saved-0", setPinned() {} });
  app.ctx.sessionManager = {
    getSessionId: () => "saved-0", getSessionFile: () => "/synthetic/0.jsonl", getSessionDir: () => "/synthetic",
  } as unknown as ExtensionCommandContext["sessionManager"];
  await app.run();
  expect(app.dialogs[2]?.title).toContain("Pinned · 1 of 1");
  expect(app.dialogs[2]?.choices[0]).toContain("Task 24");
  expect(app.dialogs[2]?.choices).not.toContain("Show more");
});

test("pin read/write failures keep browsing available without leaking errors", async () => {
  const failedRead = setup(["Recent", "first", "Back", "Close"], false, async () => ({ sessions: saved, warnings: [] }),
    { isPinned() { throw Error("secret"); }, setPinned() {} });
  await failedRead.run();
  expect(failedRead.dialogs[1]?.title).toContain("coverage notes");
  expect(failedRead.notifications).toContain("Could not read pin metadata. Check the private pins directory.");
  expect(failedRead.dialogs[2]?.choices).toEqual(["Back"]);
  const failedWrite = setup(["Recent", "first", "Pin session", "Close"], false, async () => ({ sessions: saved, warnings: [] }),
    { isPinned: () => false, setPinned() { throw Error("secret"); } });
  await failedWrite.run();
  expect(failedWrite.notifications).toEqual(["Could not save pin metadata. Session files were not changed."]);
});

test("picker offers read-only details and refresh", async () => {
  const app = setup(["first", "Back", "Refresh", "Close"]); await app.run();
  expect(app.dialogs[1]?.title).toContain("Directory:");
  expect(app.scans()).toBe(2); // Returning from details retains the snapshot.
});

test("invalid args, no UI, and discovery errors are safe", async () => {
  const bad = setup(); await bad.run("extra"); expect(bad.scans()).toBe(0);
  expect(bad.notifications).toEqual(["Usage: /sessions"]);
  const headless = setup(); headless.ctx.hasUI = false; await headless.run(); expect(headless.scans()).toBe(0);
  const failed = setup([], true); await failed.run(); expect(failed.dialogs[0]?.title).toContain("Could not load sessions");
});

test("picker stops instead of rescanning when the prompt no longer blocks", async () => {
  let handler!: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
  const notifications: string[] = [];
  let scans = 0;
  const pi = { registerCommand(_name: string, command: { handler: typeof handler }) { handler = command.handler; } } as unknown as ExtensionAPI;
  registerSessionsCommand(pi, { pid: -1, now: () => 0, overview: () => { scans++; return demoOverview(); } });
  const ctx = { hasUI: true, ui: {
    // A misbehaving host that answers "Refresh" forever without ever waiting for input.
    select: async (_title: string, _options: string[]) => "Refresh",
    notify: (message: string) => notifications.push(message),
  } } as unknown as ExtensionCommandContext;
  await handler("", ctx);
  expect(scans).toBeLessThanOrEqual(51);
  expect(notifications).toEqual(["Closed /sessions: the selection prompt stopped waiting for input."]);
});
