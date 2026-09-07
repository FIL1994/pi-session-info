import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync, symlinkSync, existsSync, statSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateRecord } from "../src/core/registry-schema";
import { readProcessIdentity } from "../src/process/identity";
import { readRecords, removeRecord, resolveRegistryDir, writeRecord } from "../src/registry/store";

const record = (id = "123e4567-e89b-12d3-a456-426614174000") => ({ schemaVersion: 1 as const, instanceId: id, sequence: 1, pid: 7, processIdentity: "boot:1", startedAt: new Date(0).toISOString(), heartbeatAt: new Date(0).toISOString(), activityAt: new Date(0).toISOString(), sessionId: null, sessionFile: null, leafId: null, cwd: "/tmp", sessionName: null, mode: null, provider: null, model: null, thinking: null, activity: "unknown" as const, activeTools: [], capabilities: [] });

test("validates strict records and rejects unknown fields", () => { expect(validateRecord(record())).toBe(true); expect(validateRecord({ ...record(), secret: "no" })).toBe(false); });
test("writes atomically and skips malformed records", () => {
  const dir = mkdtempSync(join(tmpdir(), "registry-test-")); try { writeRecord(dir, record()); writeFileSync(join(dir, "123e4567-e89b-12d3-a456-426614174001.json"), "{}"); const got = readRecords(dir); expect(got.records).toHaveLength(1); expect(got.warnings).toHaveLength(1); } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("resolves explicit paths and only valid private XDG runtime dirs", () => {
  const root = mkdtempSync(join(tmpdir(), "registry-path-"));
  try {
    expect(resolveRegistryDir({ PI_SESSION_INFO_REGISTRY_DIR: "/x" }, "/home/u")).toBe("/x");
    expect(resolveRegistryDir({ XDG_RUNTIME_DIR: root }, "/home/u")).toBe(join(root, "pi-session-info"));
    for (const path of ["relative", join(root, "missing")]) expect(resolveRegistryDir({ XDG_RUNTIME_DIR: path }, "/home/u")).toBe("/home/u/.cache/pi-session-info/run");
    chmodSync(root, 0o755);
    expect(resolveRegistryDir({ XDG_RUNTIME_DIR: root }, "/home/u")).toBe("/home/u/.cache/pi-session-info/run");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("reads synthetic Linux identity and rejects zombies", () => { const root = mkdtempSync(join(tmpdir(), "proc-test-")); try { mkdirSync(join(root, "7")); writeFileSync(join(root, "7", "stat"), ["7 (pi)", "S", ...Array(18).fill("0"), "42"].join(" ")); mkdirSync(join(root, "sys", "kernel", "random"), { recursive: true }); writeFileSync(join(root, "sys/kernel/random/boot_id"), "boot\n"); expect(readProcessIdentity(7, root)).toBe("boot:42"); } finally { rmSync(root, { recursive: true, force: true }); } });

test("registry permissions, missing directory, atomic replacement and idempotent removal", () => {
  const root = mkdtempSync(join(tmpdir(), "registry-safe-")); const dir = join(root, "run");
  try {
    expect(readRecords(dir)).toEqual({ records: [], warnings: [] }); expect(existsSync(dir)).toBe(false);
    removeRecord(dir, record().instanceId);
    writeRecord(dir, record()); writeRecord(dir, { ...record(), sequence: 2 });
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(join(dir, `${record().instanceId}.json`)).mode & 0o777).toBe(0o600);
    expect(readRecords(dir).records[0]?.sequence).toBe(2); expect(readdirSync(dir)).toHaveLength(1);
    removeRecord(dir, record().instanceId); removeRecord(dir, record().instanceId);
    expect(readRecords(dir).records).toEqual([]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("unsafe directories and symlinks cannot be followed or created through", () => {
  const root = mkdtempSync(join(tmpdir(), "registry-links-"));
  try {
    const target = join(root, "target"); mkdirSync(target, 0o700);
    const link = join(root, "link"); symlinkSync(target, link);
    expect(() => writeRecord(join(link, "child"), record())).toThrow(); expect(existsSync(join(target, "child"))).toBe(false);
    expect(readRecords(link).warnings.length).toBeGreaterThan(0);
    chmodSync(target, 0o702);
    expect(() => writeRecord(join(target, "child"), record())).toThrow(); expect(existsSync(join(target, "child"))).toBe(false);
    expect(readRecords(target).warnings.length).toBeGreaterThan(0);
    expect(() => removeRecord(root, "../target")).toThrow();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("untrusted records are bounded, nonblocking, and never leak file descriptors", () => {
  const root = mkdtempSync(join(tmpdir(), "registry-input-"));
  const ids = Array.from({ length: 5 }, (_, n) => `123e4567-e89b-12d3-a456-${String(n).padStart(12, "0")}`);
  try {
    writeFileSync(join(root, `${ids[0]}.json`), "{", { mode: 0o600 });
    writeFileSync(join(root, `${ids[1]}.json`), "x".repeat(128 * 1024 + 1), { mode: 0o600 });
    symlinkSync(join(root, `${ids[0]}.json`), join(root, `${ids[2]}.json`));
    execFileSync("mkfifo", ["-m", "600", join(root, `${ids[3]}.json`)]);
    writeFileSync(join(root, `${ids[4]}.json`), JSON.stringify(record()), { mode: 0o600 }); // mismatched id
    const before = readdirSync("/proc/self/fd").length;
    for (let n = 0; n < 20; n++) {
      const result = readRecords(root); expect(result.records).toEqual([]); expect(result.warnings).toHaveLength(1);
    }
    expect(readdirSync("/proc/self/fd").length).toBe(before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("schema rejects versions, invalid dates, content fields, and oversized collections", () => {
  for (const extra of [
    { schemaVersion: 2 }, { heartbeatAt: "2026-02-30T00:00:00.000Z" }, { mode: "other" },
    { processIdentity: "" }, { pid: 0 }, { sequence: -1 }, { prompts: [] },
    { activeTools: [{ id: "id", name: "read", args: "secret" }] },
    { activeTools: Array(101).fill({ id: "id", name: "read" }) },
  ]) expect(validateRecord({ ...record(), ...extra })).toBe(false);
});

test("directory scan cap is explicit", () => {
  const root = mkdtempSync(join(tmpdir(), "registry-cap-"));
  try {
    for (let n = 0; n < 130; n++) writeFileSync(join(root, `.temporary-${n}`), "");
    expect(readRecords(root).warnings.join(" ")).toContain("limit reached");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("oversized writes and unsafe record removal fail without touching unrelated data", () => {
  const root = mkdtempSync(join(tmpdir(), "registry-reject-"));
  try {
    const child = join(root, "not-created");
    expect(() => writeRecord(child, { ...record(), capabilities: Array(100).fill("x".repeat(4096)) })).toThrow("too large");
    expect(existsSync(child)).toBe(false);
    const target = join(root, "unrelated"); writeFileSync(target, "keep", { mode: 0o600 });
    const link = join(root, `${record().instanceId}.json`); symlinkSync(target, link);
    expect(() => removeRecord(root, record().instanceId)).toThrow(); expect(existsSync(target)).toBe(true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("identity rejects dead states and malformed ticks, handles parentheses in comm", () => {
  const root = mkdtempSync(join(tmpdir(), "identity-states-"));
  try {
    mkdirSync(join(root, "7")); mkdirSync(join(root, "sys/kernel/random"), { recursive: true });
    writeFileSync(join(root, "sys/kernel/random/boot_id"), "boot");
    for (const state of ["S", "Z", "X", "x"]) {
      writeFileSync(join(root, "7/stat"), `7 (pi (with spaces)) ${[state, ...Array(18).fill("0"), "42"].join(" ")}`);
      expect(readProcessIdentity(7, root)).toBe(state === "S" ? "boot:42" : null);
    }
    writeFileSync(join(root, "7/stat"), `7 (pi) ${["S", ...Array(18).fill("0"), "invalid"].join(" ")}`);
    expect(readProcessIdentity(7, root)).toBeNull();
    expect(readProcessIdentity(-1, root)).toBeNull(); expect(readProcessIdentity(8, root)).toBeNull();
  } finally { rmSync(root, { recursive: true, force: true }); }
});
