import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createPinStore, resolvePinsDir } from "../src/pins";

const roots: string[] = [];
function fixture() { const root = mkdtempSync(join(tmpdir(), "session-pins-")); roots.push(root); return root; }
afterEach(() => { for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true }); });

test("pins persist across instances without losing unrelated updates", () => {
  const dir = join(fixture(), "pins");
  const a = createPinStore(dir), b = createPinStore(dir);
  expect(a.isPinned("one")).toBe(false);
  a.setPinned("one", true); b.setPinned("two", true);
  expect(createPinStore(dir).isPinned("one")).toBe(true);
  a.setPinned("one", false);
  expect(b.isPinned("one")).toBe(false);
  expect(b.isPinned("two")).toBe(true);
  a.setPinned("one", false);
  expect(statSync(dir).mode & 0o777).toBe(0o700);
  const file = join(dir, readdirSync(dir)[0]!);
  expect(statSync(file).mode & 0o777).toBe(0o600);
  expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ schemaVersion: 1, sessionId: "two" });
});

test("pin IDs cannot escape the directory; corrupt and public state is refused", () => {
  const dir = join(fixture(), "pins");
  const store = createPinStore(dir);
  store.setPinned("../../escape", true);
  const file = join(dir, readdirSync(dir)[0]!);
  expect(readdirSync(dir)[0]).toMatch(/^[a-f0-9]{64}\.json$/);
  writeFileSync(file, '{"schemaVersion":99}');
  expect(() => store.setPinned("../../escape", false)).toThrow();
  expect(() => store.isPinned("../../escape")).toThrow();
  chmodSync(dir, 0o755);
  expect(() => store.setPinned("other", true)).toThrow();
});

test("symlink directories and record symlinks are rejected without touching targets", () => {
  const root = fixture(), target = fixture();
  const alias = join(root, "alias"); symlinkSync(target, alias);
  expect(() => createPinStore(alias).setPinned("one", true)).toThrow();
  const dir = join(root, "pins"), store = createPinStore(dir);
  store.setPinned("one", true);
  const file = join(dir, readdirSync(dir)[0]!);
  rmSync(file);
  const targetFile = join(target, "keep"); writeFileSync(targetFile, "unchanged"); symlinkSync(targetFile, file);
  expect(() => store.isPinned("one")).toThrow();
  expect(() => store.setPinned("one", false)).toThrow();
  expect(readFileSync(targetFile, "utf8")).toBe("unchanged");
});

test("pin storage uses persistent XDG state, not the runtime registry", () => {
  expect(resolvePinsDir({}, "/home/test")).toBe("/home/test/.local/state/pi-session-info/pins");
  expect(resolvePinsDir({ XDG_STATE_HOME: "/state" }, "/home/test")).toBe("/state/pi-session-info/pins");
  expect(resolvePinsDir({ XDG_STATE_HOME: "relative" }, "/home/test")).toBe("/home/test/.local/state/pi-session-info/pins");
});
