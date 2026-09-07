import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverSessions } from "../src/discover";

test("fallback distinguishes same-cwd processes and excludes bridges and zombies", () => {
  const root = mkdtempSync(join(tmpdir(), "session-info-test-"));
  try {
    for (const [pid, name, state] of [["10", "pi", "S"], ["20", "pi", "S"], ["30", "exec_bridge", "S"], ["40", "pi", "Z"]]) {
      const base = join(root, pid!);
      mkdirSync(base);
      writeFileSync(join(base, "comm"), name!);
      writeFileSync(join(base, "stat"), `${pid} (${name}) ${[state, ...Array(18).fill("0"), "123"].join(" ")}`);
      symlinkSync("/example/project", join(base, "cwd"));
    }
    const result = discoverSessions(root, "linux");
    expect(result.sessions.map((s) => s.pid)).toEqual([10, 20]);
    expect(result.sessions.every((s) => s.activity === "unknown")).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("unsupported platforms fail explicitly", () => {
  expect(() => discoverSessions("/unused", "darwin")).toThrow("Linux only");
});
