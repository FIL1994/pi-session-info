import { expect, test } from "bun:test";
import { runCli } from "../src/cli";
import { terminalText } from "../src/format";
import { demoOverview } from "../src/demo";

test("help explains the scaffold boundary", () => {
  const result = runCli(["--help"]);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("Linux process discovery");
});

test("demo renders readable status without diagnostic columns", () => {
  const result = runCli(["--demo"]);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("Pi sessions (demo)");
  expect(result.stdout).toContain("Not connected");
  expect(result.stdout).toContain("Using tools");
  expect(result.stdout).not.toContain("EVIDENCE");
});

test("JSON output is a versioned, explicitly synthetic envelope", () => {
  const result = runCli(["--demo", "--json"]);
  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");
  const data = JSON.parse(result.stdout);
  expect(data.schemaVersion).toBe(1);
  expect(data.source).toBe("demo");
  expect(data.sessions).toHaveLength(3);
  expect(data.sessions[2].sessionId).toBeNull();
});

test("unsupported flags and positional arguments fail", () => {
  for (const args of [["--watch"], ["unexpected"], ["--demo", "--typo"]]) {
    expect(runCli(args).code).toBe(2);
  }
});

test("terminal output neutralizes control sequences and line injection", () => {
  expect(terminalText("hello\x1b]52;secret\x07\nworld\x9b")).toBe(
    "hello\\u001b]52;secret\\u0007\\u000aworld\\u009b",
  );
});

test("text output uses the injected snapshot clock and process identity", () => {
  const now = Date.parse("2026-01-02T12:00:00Z");
  const base = demoOverview();
  const result = runCli([], {
    now: () => now,
    processIdentity: "boot:current",
    overview: () => ({
      ...base,
      generatedAt: new Date(now).toISOString(),
      sessions: [
        {
          ...base.sessions[0]!,
          processIdentity: "boot:current",
          activityAt: new Date(now - 120_000).toISOString(),
        },
        {
          ...base.sessions[1]!,
          pid: base.sessions[0]!.pid,
          processIdentity: "boot:other",
          activityAt: new Date(now - 120_000).toISOString(),
        },
      ],
    }),
  });
  expect(result.stdout).toContain("this process");
  expect(result.stdout).toContain("last observed change: 2 minutes ago");
  expect(result.stdout).toContain("PID 4101 · this process");
  expect(result.stdout).toContain("PID 4101\n");
});
