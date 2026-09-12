import { expect, test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerListPiSessionsTool } from "../src/extension/tool";
import { demoOverview } from "../src/demo";
import type { Overview } from "../src/core/types";

function setup(
  history?: (...args: any[]) => Promise<any>,
  overview: Overview = { ...demoOverview(), sessions: demoOverview().sessions.slice(0, 1) },
) {
  let tool: any;
  registerListPiSessionsTool({ registerTool: (value: unknown) => (tool = value) } as ExtensionAPI, {
    overview: () => overview,
    history: history ?? (async () => ({ sessions: [], warnings: [] })),
    now: () => 0,
  });
  return tool;
}

const ctx = {
  sessionManager: {
    getSessionId: () => "current",
    getSessionFile: () => "/x/current.jsonl",
    getSessionDir: () => "/x",
  },
};

test("registers without UI and defaults to running without reading history", async () => {
  let reads = 0;
  const tool = setup(async () => {
    reads++;
    return { sessions: [], warnings: [] };
  });
  const result = await tool.execute("id", {}, new AbortController().signal, undefined, ctx);
  expect(reads).toBe(0);
  expect(result.details.scope).toBe("running");
  expect(result.details.counts.returned).toBe(1);
});

test("recent and both expose bounded metadata, directories, grouping, and warnings", async () => {
  const tool = setup(async (_options) => ({
    sessions: [
      {
        sessionId: "saved",
        sessionFile: "/x/saved.jsonl",
        cwd: "/x",
        name: null,
        modifiedAt: new Date(1).toISOString(),
      },
    ],
    warnings: ["partial scan"],
  }));
  const result = await tool.execute(
    "id",
    { scope: "both", groupByCwd: true, limit: 1 },
    new AbortController().signal,
    undefined,
    ctx,
  );
  expect(result.details.counts.total).toBe(2);
  expect(result.details.groups[0].sessions[0].kind).toBe("running");
  expect(result.details.warnings).toContain("partial scan");
  expect(result.details.historyDirectories).toContain("/x");
});

test("abort and history failure are errors, not empty success", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    setup().execute("id", { scope: "recent" }, controller.signal, undefined, ctx),
  ).rejects.toThrow();
  await expect(
    setup(async () => ({ sessions: [], warnings: [], failed: true })).execute(
      "id",
      { scope: "recent" },
      new AbortController().signal,
      undefined,
      ctx,
    ),
  ).rejects.toThrow();
});

test("recent excludes current session and paginates with page-scoped directories", async () => {
  const tool = setup(async () => ({
    sessions: ["current", "one", "two"].map((id, i) => ({
      sessionId: id,
      sessionFile: `/x/${id}.jsonl`,
      cwd: `/${id}`,
      name: null,
      modifiedAt: new Date(100 - i).toISOString(),
    })),
    warnings: ["partial scan"],
  }));
  const first = (await tool.execute("id", { scope: "recent", limit: 1 }, undefined, undefined, ctx))
    .details;
  expect(first.counts.total).toBe(2);
  expect(first.nextOffset).toBe(1);
  expect(first.projectDirectories).toEqual(["/one"]);
  expect(first.coverage.complete).toBe(false);
  expect(first.sessions[0].kind).toBe("recent");
  expect(first.sessions[0].session.activity).toBeUndefined();
  const second = (
    await tool.execute("id", { scope: "recent", limit: 1, offset: 1 }, undefined, undefined, ctx)
  ).details;
  expect(second.projectDirectories).toEqual(["/two"]);
  expect(second.nextOffset).toBeNull();
});

test("cancellation during history does not return partial results", async () => {
  const controller = new AbortController();
  const tool = setup(async () => {
    controller.abort();
    return { sessions: [], warnings: [] };
  });
  await expect(
    tool.execute("id", { scope: "both" }, controller.signal, undefined, ctx),
  ).rejects.toThrow();
});

test("exact filters apply before pagination and page grouping", async () => {
  const base = demoOverview();
  const overview: Overview = {
    ...base,
    sessions: [
      {
        ...base.sessions[0]!,
        instanceId: "first",
        sessionId: "one",
        cwd: "/same",
        processIdentity: "boot:shared",
        pid: 4101,
      },
      {
        ...base.sessions[0]!,
        instanceId: "second",
        sessionId: "two",
        cwd: "/same",
        processIdentity: "boot:shared",
        pid: 4101,
      },
      {
        ...base.sessions[0]!,
        instanceId: "third",
        sessionId: "three",
        cwd: "/other",
        processIdentity: "boot:shared",
        pid: 4101,
      },
    ],
  };
  const result = (
    await setup(undefined, overview).execute(
      "id",
      { cwd: "/same", groupByCwd: true, limit: 1, offset: 1 },
      undefined,
      undefined,
      ctx,
    )
  ).details;
  expect(result.counts).toEqual({ total: 2, offset: 1, returned: 1 });
  expect(result.sessions[0].session.sessionId).toBe("two");
  expect(result.groups).toEqual([
    {
      cwd: "/same",
      sessions: [{ kind: "running", instanceId: "second", sessionId: "two", pid: 4101 }],
    },
  ]);
  expect(result.warnings.filter((warning: string) => warning.includes("PID 4101"))).toHaveLength(1);
  expect(result.warnings.some((warning: string) => warning.includes("boot:shared"))).toBe(true);
});

test("compact and full projections keep live identity and separate recent metadata", async () => {
  const base = demoOverview();
  const live: Overview = {
    ...base,
    sessions: [
      {
        ...base.sessions[0]!,
        instanceId: "live-instance",
        processIdentity: "boot:1",
        sessionFile: "/very/long/private/path/session.jsonl",
        sessionId: null,
        activityAt: new Date(0).toISOString(),
        provider: "provider",
      },
    ],
  };
  const history = async () => ({
    sessions: [
      {
        sessionId: "saved",
        sessionFile: "/very/long/private/path/saved.jsonl",
        cwd: "/saved",
        name: "Saved task",
        modifiedAt: new Date(0).toISOString(),
      },
    ],
    warnings: [],
  });
  const compact = (
    await setup(history, live).execute("id", { scope: "both" }, undefined, undefined, ctx)
  ).details;
  expect(compact.detail).toBe("compact");
  expect(compact.sessions[0].session).toMatchObject({
    instanceId: "live-instance",
    sessionId: null,
    provider: "provider",
    lastChangeAge: "just now",
  });
  expect(compact.sessions[0].session.sessionFile).toBeUndefined();
  const recent = compact.sessions.find((row: any) => row.kind === "recent");
  expect(recent.session).toEqual({
    sessionId: "saved",
    cwd: "/saved",
    name: "Saved task",
    lastSavedAge: "just now",
  });
  expect(recent.session.activity).toBeUndefined();

  const full = (
    await setup(history, live).execute(
      "id",
      { scope: "both", detail: "full" },
      undefined,
      undefined,
      ctx,
    )
  ).details;
  expect(full.detail).toBe("full");
  expect(full.sessions[0].session.sessionFile).toBe("/very/long/private/path/session.jsonl");
  expect(full.sessions[0].session.activityAt).toBe(new Date(0).toISOString());
});
