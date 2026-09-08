import { describe, expect, test } from "bun:test";
import { createActivityState, reduceActivity } from "../src/core/activity";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { RegistryRecord } from "../src/core/registry-schema";
import { registerLifecycle } from "../src/extension/lifecycle";
import { validateRecord } from "../src/core/registry-schema";

function harness(options: { failWrite?: boolean; noIdentity?: boolean; hasUI?: boolean } = {}) {
  let now = 1_000;
  let counter = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const writes: RegistryRecord[] = [];
  const removed: string[] = [];
  const notices: string[] = [];
  const handlers = new Map<string, (event: Record<string, unknown>, ctx: ExtensionContext) => void>();
  let idle = true;
  let model = "fixture-model";
  let session = "fixture-session";
  let parentSession: string | undefined;
  let name = "Fixture name";
  let unrefs = 0;
  const ctx = {
    hasUI: options.hasUI ?? true, mode: "tui", thinkingLevel: "high",
    get model() { return { provider: "fixture", id: model }; },
    isIdle: () => idle,
    sessionManager: { getSessionId: () => session, getSessionFile: () => undefined, getLeafId: () => "leaf",
      getCwd: () => "/fixture/project", getSessionName: () => name, getHeader: () => ({ parentSession }) },
    ui: { notify: (text: string) => notices.push(text) },
  } as unknown as ExtensionContext;
  const pi = { on: (event: string, handler: (event: Record<string, unknown>, ctx: ExtensionContext) => void) => handlers.set(event, handler) } as unknown as ExtensionAPI;
  registerLifecycle(pi, {
    clock: () => now, pid: 10, dir: "/unused-fixture", identity: () => options.noIdentity ? null : "boot:123",
    uuid: () => `11111111-1111-4111-8111-${String(++counter).padStart(12, "0")}`,
    setTimeout: ((fn: () => void, ms: number) => {
      const id = ++counter; timers.set(id, { at: now + ms, fn });
      return { id, unref: () => { unrefs++; } };
    }) as unknown as typeof setTimeout,
    clearTimeout: ((handle: { id: number }) => timers.delete(handle.id)) as unknown as typeof clearTimeout,
    write: (_dir, record) => {
      if (options.failWrite) throw Error("fixture storage failure");
      expect(validateRecord(record)).toBe(true);
      writes.push(structuredClone(record));
    },
    remove: (_dir, id) => removed.push(id),
  });
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      now = due[1].at; timers.delete(due[0]); due[1].fn();
    }
    now = end;
  };
  return { writes, removed, notices, timers, advance, unrefs: () => unrefs,
    parent: (value: string | undefined) => { parentSession = value; },
    emit: (event: string, data: Record<string, unknown> = {}) => handlers.get(event)?.(data, ctx),
    idle: (value: boolean) => { idle = value; }, model: (value: string) => { model = value; },
    session: (value: string) => { session = value; }, name: (value: string) => { name = value; },
    last: () => writes.at(-1)!,
  };
}

test("parent metadata follows the session and clears on switching to an unlinked session", () => {
  const h = harness();
  h.parent("/synthetic/parent.jsonl");
  h.emit("session_start");
  expect(h.last().parentSessionFile).toBe("/synthetic/parent.jsonl");
  h.parent(undefined);
  h.session("new-session");
  h.emit("session_start");
  expect(h.last().parentSessionFile).toBeNull();
  expect(h.last().sessionId).toBe("new-session");
  h.emit("session_shutdown");
});

test("activation publishes real metadata immediately; idle heartbeat doesn't invent activity", () => {
  const h = harness(); expect(h.timers.size).toBe(0);
  h.emit("session_start");
  expect(h.last().model).toBe("fixture-model"); expect(h.last().activity).toBe("idle");
  expect(h.last().cwd).toBe("/fixture/project"); expect(h.last().thinking).toBe("high");
  const activityAt = h.last().activityAt;
  h.advance(5_000);
  expect(h.last().sequence).toBe(2); expect(h.last().activityAt).toBe(activityAt);
  expect(h.last().heartbeatAt).not.toBe(activityAt);
  expect(h.unrefs()).toBeGreaterThan(0);
  h.emit("session_shutdown"); expect(h.timers.size).toBe(0);
});

test("tool bursts coalesce, preserve concurrent calls and exclude arguments/results", () => {
  const h = harness(); h.emit("session_start"); h.idle(false); h.emit("agent_start");
  h.emit("tool_execution_start", { toolCallId: "a", toolName: "read", args: { secret: "never-record-this" } });
  h.emit("tool_execution_start", { toolCallId: "b", toolName: "bash" });
  expect(h.writes).toHaveLength(1); h.advance(250);
  expect(h.last().activeTools).toHaveLength(2);
  h.emit("tool_execution_end", { toolCallId: "a", result: "never-record-this" }); h.advance(250);
  expect(h.last().activity).toBe("tool"); expect(h.last().activeTools).toEqual([{ id: "b", name: "bash" }]);
  h.emit("tool_execution_end", { toolCallId: "b" }); h.advance(250);
  expect(h.last().activity).toBe("working"); expect(JSON.stringify(h.writes)).not.toContain("never-record-this");
  h.emit("session_shutdown");
});

test("retry, UI waiting, compaction failure and host sampling don't leave false idle or stuck working", () => {
  const h = harness(); h.emit("session_start"); h.idle(false); h.emit("agent_start"); h.emit("agent_end"); h.advance(250);
  expect(h.last().activity).toBe("working");
  h.emit("ui_prompt_start"); h.advance(250); expect(h.last().activity).toBe("waiting-user");
  h.emit("ui_prompt_end"); h.advance(250); expect(h.last().activity).toBe("working");
  h.idle(true); h.emit("agent_settled"); h.advance(250); expect(h.last().activity).toBe("idle");
  h.emit("session_before_compact"); h.advance(250); expect(h.last().activity).toBe("working");
  h.emit("session_compact_failed"); h.advance(250); expect(h.last().activity).toBe("idle");
  h.idle(false); h.advance(5_000); expect(h.last().activity).toBe("working");
  h.idle(true); h.advance(5_000); expect(h.last().activity).toBe("idle");
  h.emit("session_shutdown");
});

test("model/name refresh and heartbeat sampling update activity time only on changes", () => {
  const h = harness(); h.emit("session_start"); const old = h.last().activityAt;
  h.advance(100); h.model("new-model"); h.emit("model_select"); h.advance(250);
  expect(h.last().model).toBe("new-model"); expect(h.last().activityAt).not.toBe(old);
  h.name("new name"); h.advance(5_000); expect(h.last().sessionName).toBe("new name");
  h.emit("session_shutdown");
});

test("shutdown cancels pending writes and late events; reactivation has a new identity", () => {
  const h = harness(); h.emit("session_start"); const first = h.last().instanceId;
  h.model("next"); h.emit("model_select"); h.emit("session_shutdown");
  h.emit("session_shutdown"); h.emit("tool_execution_start", { toolCallId: "late", toolName: "read" }); h.advance(10_000);
  expect(h.writes).toHaveLength(1); expect(h.removed).toEqual([first]);
  h.session("new-session"); h.emit("session_start"); expect(h.last().instanceId).not.toBe(first);
  expect(h.last().sessionId).toBe("new-session"); h.emit("session_shutdown");
});

test("storage and identity failures stay observational, warn once, and respect no-UI mode", () => {
  for (const noIdentity of [false, true]) {
    const h = harness({ failWrite: true, noIdentity });
    h.emit("session_start"); h.emit("agent_start"); h.advance(10_000); h.emit("session_shutdown");
    expect(h.notices).toHaveLength(1); expect(h.writes).toHaveLength(0);
    const headless = harness({ failWrite: true, noIdentity, hasUI: false });
    headless.emit("session_start"); headless.advance(10_000); headless.emit("session_shutdown");
    expect(headless.notices).toHaveLength(0);
  }
});

describe("activity lifecycle reducer", () => {
  test("keeps concurrent tools active until each ends", () => {
    let state = createActivityState();
    state = reduceActivity(state, "agent_start");
    state = reduceActivity(state, "tool_execution_start", { id: "a", name: "read" });
    state = reduceActivity(state, "tool_execution_start", { id: "b", name: "bash" });
    state = reduceActivity(state, "tool_execution_end", { id: "a" });
    expect(state.activity).toBe("tool");
    state = reduceActivity(state, "tool_execution_end", { id: "b" });
    expect(state.activity).toBe("working");
  });

  test("agent_end does not infer idle and prompt restores state", () => {
    let state = reduceActivity(createActivityState(), "agent_start");
    state = reduceActivity(state, "agent_end");
    expect(state.activity).toBe("working");
    state = reduceActivity(state, "ui_prompt_start");
    expect(state.activity).toBe("waiting-user");
    state = reduceActivity(state, "ui_prompt_end");
    expect(state.activity).toBe("working");
  });
});
