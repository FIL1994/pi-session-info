import { expect, test } from "bun:test";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { registerSessionsCommand } from "../src/extension/index";
import { demoOverview } from "../src/demo";

function setup(choices: (string | undefined)[] = ["Close"], fail = false) {
  let handler!: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
  const dialogs: { title: string; choices: string[] }[] = [];
  const notifications: string[] = [];
  let scans = 0;
  const pi = { registerCommand(name: string, command: { handler: typeof handler }) {
    expect(name).toBe("sessions"); handler = command.handler;
  } } as unknown as ExtensionAPI;
  registerSessionsCommand(pi, { pid: -1, overview: () => { scans++; if (fail) throw Error("fixture error"); return demoOverview(); } });
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

test("picker offers read-only details and refresh", async () => {
  const app = setup(["first", "Back", "Refresh", "Close"]); await app.run();
  expect(app.dialogs[1]?.title).toContain("Directory:");
  expect(app.scans()).toBe(3);
});

test("invalid args, no UI, and discovery errors are safe", async () => {
  const bad = setup(); await bad.run("extra"); expect(bad.scans()).toBe(0);
  expect(bad.notifications).toEqual(["Usage: /sessions"]);
  const headless = setup(); headless.ctx.hasUI = false; await headless.run(); expect(headless.scans()).toBe(0);
  const failed = setup([], true); await failed.run(); expect(failed.notifications).toHaveLength(1);
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
