import { expect, test } from "bun:test";
import { recentSessions, parentMatch, savedDetails } from "../src/history/recent";
import { demoOverview } from "../src/demo";
import type { SavedSession } from "../src/history/reader";

function saved(id: string, time = 1000): SavedSession {
  return {
    sessionId: id,
    sessionFile: `/synthetic/${id}.jsonl`,
    cwd: "/synthetic/project",
    name: null,
    modifiedAt: new Date(time).toISOString(),
  };
}

test("ancestry matches only the parent file, not cwd, and does not imply liveness", () => {
  const parent = saved("parent");
  const child = { ...saved("child"), parentSessionFile: parent.sessionFile };
  expect(parentMatch(child, [parent])).toBe("matched");
  expect(parentMatch(child, [saved("unrelated")])).toBe("unavailable");
  expect(parentMatch(saved("unknown"), [parent])).toBe("unknown");
  expect(savedDetails(child, [parent]).join("\n")).toContain("not evidence of liveness");
  expect(savedDetails(child, []).join("\n")).toContain("outside discovery coverage");
  expect(savedDetails(saved("unknown")).join("\n")).toContain("Unknown (no parent metadata)");
});

test("excludes exact live IDs and paths including stale telemetry, not same cwd", () => {
  const live = demoOverview();
  live.sessions = [
    {
      ...live.sessions[0]!,
      sessionId: "active",
      sessionFile: "/synthetic/by-file.jsonl",
      freshness: "stale",
      cwd: "/synthetic/project",
    },
  ];
  const result = recentSessions(
    { sessions: [saved("active"), saved("by-file"), saved("current"), saved("old")], warnings: [] },
    live,
    { sessionId: "current" },
  );
  expect(result.sessions.map((s) => s.sessionId)).toEqual(["old"]);
});

test("orders newest first and deduplicates before pagination without altering inputs", () => {
  const sessions = [
    saved("old", 1000),
    saved("new", 3000),
    saved("new", 2000),
    saved("middle", 2000),
  ];
  const live = demoOverview();
  live.sessions = [];
  const result = recentSessions({ sessions, warnings: ["partial scan"] }, live);
  expect(result.sessions.map((s) => s.sessionId)).toEqual(["new", "middle", "old"]);
  expect(sessions).toHaveLength(4);
  expect(result.warnings).toContain("partial scan");
});

test("unmapped processes produce one coverage note, not invented stopped/idle statuses", () => {
  const live = demoOverview();
  const result = recentSessions({ sessions: [saved("old")], warnings: [] }, live);
  expect(result.warnings.join(" ")).toContain("saved history may still appear");
  expect(result.sessions[0]).not.toHaveProperty("activity");
});

test("current file is excluded even without a published live row; resumed sessions disappear", () => {
  const live = demoOverview();
  const row = live.sessions[0]!;
  live.sessions = [];
  const history = { sessions: [saved("current"), saved("resumed"), saved("older")], warnings: [] };
  const current = { sessionFile: "/synthetic/./current.jsonl" };
  expect(recentSessions(history, live, current).sessions).toHaveLength(2);
  live.sessions.push({ ...row, sessionId: "resumed" });
  expect(recentSessions(history, live, current).sessions.map((s) => s.sessionId)).toEqual([
    "older",
  ]);
});
