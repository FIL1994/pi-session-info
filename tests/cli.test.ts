import { expect, test } from "bun:test";
import { runCli } from "../src/cli";
import { terminalText } from "../src/format";

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
