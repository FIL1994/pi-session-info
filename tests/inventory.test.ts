import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RegistryRecord } from "../src/core/registry-schema";
import type { Overview } from "../src/core/types";
import { liveOverview, reconcile } from "../src/inventory";
import { writeRecord } from "../src/registry/store";
import { formatDetails, formatOverview } from "../src/format";

const now = Date.parse("2026-01-01T00:00:10.000Z");
const stamp = new Date(now).toISOString();
const record: RegistryRecord = {
  schemaVersion: 1, instanceId: "11111111-1111-4111-8111-111111111111", sequence: 1,
  pid: 10, processIdentity: "boot:123", startedAt: stamp, heartbeatAt: stamp, activityAt: stamp,
  sessionId: "session-a", sessionFile: null, leafId: null, cwd: "/example/project", sessionName: "Fix layout",
  mode: "tui", provider: "example", model: "test-model", thinking: "high", activity: "tool",
  activeTools: [{ id: "tool-1", name: "read" }], capabilities: ["parent-lifecycle"],
};
const fallback: Overview = { schemaVersion: 1, source: "live", warnings: [], sessions: [
  { instanceId: "process-10-123", pid: 10, cwd: "/example/project", sessionId: null, name: null,
    model: null, thinking: null, activity: "unknown", evidence: "unmatched", freshness: "unknown", activeTools: [] },
] };

test("live details retain ancestry provenance and escape parent paths", () => {
  const row = { ...fallback.sessions[0]!, parentSessionFile: "/synthetic/parent\u001b[31m.jsonl" };
  const details = formatDetails(row);
  expect(details).toContain("Derived from:");
  expect(details).toContain("parent live state not checked");
  expect(details).not.toContain("\u001b");
  expect(formatDetails(fallback.sessions[0]!)).toContain("Unknown (no parent metadata)");
});

test("exact mapping replaces fallback and includes instrumented Node launchers", () => {
  const result = reconcile(fallback, [record, { ...record, pid: 20, instanceId: "other", sessionId: "session-b" }], () => "boot:123", now);
  expect(result.sessions).toHaveLength(2);
  expect(result.sessions.every((row) => row.evidence === "extension")).toBe(true);
  expect(result.sessions[0]?.activeTools).toEqual(["read"]);
});

test("PID reuse and dead processes never inherit metadata", () => {
  for (const identity of [null, "boot:456", "new-boot:123"]) {
    const result = reconcile(fallback, [record], () => identity, now);
    expect(result.sessions).toEqual(fallback.sessions);
  }
});

test("stale and future heartbeats preserve last observation, never imply idle", () => {
  for (const offset of [-20_001, 1_000]) {
    const result = reconcile(fallback, [{ ...record, heartbeatAt: new Date(now + offset).toISOString() }], () => "boot:123", now);
    expect(result.sessions[0]?.freshness).toBe("stale");
    expect(result.sessions[0]?.activity).toBe("tool");
    expect(formatOverview(result)).toContain("Stale · last observed: Using tools");
  }
});

test("presentation is compact, escaped, and marks this session", () => {
  const result = reconcile(fallback, [{ ...record, sessionName: "name\n\x1b[31m" }], () => "boot:123", now);
  const text = formatOverview(result, { currentPid: 10 });
  expect(text).toContain("project · PID 10 · this session");
  expect(text).toContain("test-model");
  expect(text).toContain("name\\u000a\\u001b");
  expect(text).not.toContain("unknown");
  expect(formatDetails(result.sessions[0]!)).toContain("Directory: /example/project");
});

test("fallback and empty state explain what to do without empty columns", () => {
  const text = formatOverview(fallback);
  expect(text).toContain("Not connected");
  expect(text).toContain("/reload");
  expect(text).not.toContain("MODEL");
  expect(formatOverview({ ...fallback, sessions: [] })).toContain("No running Pi sessions found");
});

test("same project names in different directories stay distinguishable", () => {
  const result = reconcile(fallback, [record, { ...record, pid: 20, instanceId: "other", cwd: "/different/project" }], () => "boot:123", now);
  expect(formatOverview(result)).toContain("/different/project · PID 20");
  expect(formatOverview(result)).toContain("/example/project · PID 10");
});

test("live inventory reads a private registry without losing partial-discovery warnings", () => {
  const dir = mkdtempSync(join(tmpdir(), "session-inventory-"));
  try {
    writeRecord(dir, record);
    writeFileSync(join(dir, "22222222-2222-4222-8222-222222222222.json"), "{", { mode: 0o600 });
    const result = liveOverview({
      registryDir: dir, discover: () => ({ ...fallback, warnings: ["Fixture partial discovery"] }),
      identity: () => record.processIdentity, now: () => now,
    });
    expect(result.sessions[0]?.model).toBe("test-model");
    expect(result.warnings).toHaveLength(2);
    expect(result.generatedAt).toBe(stamp);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
