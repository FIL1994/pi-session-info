import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  opendirSync,
  readSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { validateRecord, type RegistryRecord } from "../core/registry-schema";

const MAX_ENTRIES = 128;
const MAX_BYTES = 128 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";

function checkComponent(path: string, final: boolean): void {
  const stat = lstatSync(path);
  const mode = stat.mode & 0o7777;
  const owner = process.getuid?.();
  if (
    !stat.isDirectory() ||
    (stat.uid !== owner && stat.uid !== 0) ||
    (!final && (mode & 0o022) !== 0 && (mode & 0o1000) === 0) ||
    (final && (stat.uid !== owner || (mode & 0o077) !== 0))
  ) {
    throw new Error(`Unsafe registry path: ${path}`);
  }
}

/** Validate parents before mkdir; never follow symlinks or chmod existing paths. */
function prepareDir(dir: string, create: boolean): void {
  const target = resolve(dir);
  let path = "/";
  checkComponent(path, target === path);
  for (const part of target.split("/").filter(Boolean)) {
    path = join(path, part);
    try {
      checkComponent(path, path === target);
    } catch (error) {
      if (!create || !missing(error)) throw error;
      try {
        mkdirSync(path, 0o700);
      } catch (creationError) {
        // Concurrent publishers may create the same safe directory.
        if ((creationError as NodeJS.ErrnoException).code !== "EEXIST") throw creationError;
      }
      checkComponent(path, path === target);
    }
  }
}

// Shared private-directory checks for extension-owned persistent metadata.
export { prepareDir as preparePrivateDir };

export function resolveRegistryDir(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  if (env.PI_SESSION_INFO_REGISTRY_DIR) {
    if (!env.PI_SESSION_INFO_REGISTRY_DIR.startsWith("/"))
      throw new Error("Registry path must be absolute");
    return resolve(env.PI_SESSION_INFO_REGISTRY_DIR);
  }
  if (env.XDG_RUNTIME_DIR?.startsWith("/")) {
    try {
      prepareDir(env.XDG_RUNTIME_DIR, false);
      return join(resolve(env.XDG_RUNTIME_DIR), "pi-session-info");
    } catch {
      /* Invalid runtime directory: use the private home fallback. */
    }
  }
  return join(resolve(home), ".cache", "pi-session-info", "run");
}

export function writeRecord(dir: string, record: RegistryRecord): void {
  if (!validateRecord(record)) throw new Error("Invalid registry record");
  const json = JSON.stringify(record);
  if (Buffer.byteLength(json) > MAX_BYTES) throw new Error("Registry record too large");
  prepareDir(dir, true);
  const name = `${record.instanceId}.json`;
  const tmp = join(dir, `.${name}.${process.pid}.${randomBytes(12).toString("hex")}`);
  let fd: number | undefined;
  try {
    fd = openSync(
      tmp,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    writeFileSync(fd, json);
    closeSync(fd);
    fd = undefined;
    renameSync(tmp, join(dir, name));
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    try {
      unlinkSync(tmp);
    } catch {
      /* Preserve the original failure. */
    }
    throw error;
  }
}

function readRecord(path: string, expectedId: string): RegistryRecord {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (
      !stat.isFile() ||
      stat.uid !== process.getuid?.() ||
      (stat.mode & 0o077) !== 0 ||
      stat.size > MAX_BYTES
    ) {
      throw new Error("Unsafe or oversized registry record");
    }
    // Descriptor checks avoid lstat/open races; the extra byte detects growth.
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = readSync(fd, buffer, length, buffer.length - length, null);
      if (!read) break;
      length += read;
    }
    if (length > MAX_BYTES) throw new Error("Registry record too large");
    const value: unknown = JSON.parse(buffer.subarray(0, length).toString("utf8"));
    if (!validateRecord(value) || value.instanceId !== expectedId)
      throw new Error("Invalid registry record");
    return value;
  } finally {
    closeSync(fd);
  }
}

export function readRecords(dir: string): { records: RegistryRecord[]; warnings: string[] } {
  const records: RegistryRecord[] = [];
  const warnings: string[] = [];
  try {
    prepareDir(dir, false);
  } catch (error) {
    if (!missing(error)) warnings.push("Registry directory unsafe or unreadable.");
    return { records, warnings };
  }
  let skipped = 0;
  let directory: ReturnType<typeof opendirSync> | undefined;
  try {
    directory = opendirSync(dir);
    let seen = 0;
    for (;;) {
      const entry = directory.readSync();
      if (!entry) break;
      if (++seen > MAX_ENTRIES) {
        warnings.push("Registry entry limit reached; additional entries were not inspected.");
        break;
      }
      const id = entry.name.slice(0, -5);
      if (!entry.name.endsWith(".json") || !UUID.test(id)) {
        // Our atomic-write temporary files are hidden, not published records.
        if (!entry.name.startsWith(".")) skipped++;
        continue;
      }
      try {
        records.push(readRecord(join(dir, entry.name), id));
      } catch {
        skipped++;
      }
    }
  } catch {
    warnings.push("Registry directory read failed.");
  } finally {
    try {
      directory?.closeSync();
    } catch {
      warnings.push("Registry directory close failed.");
    }
  }
  if (skipped)
    warnings.push(
      `${skipped} registry record(s) skipped (unsafe, malformed, oversized, or unreadable).`,
    );
  return { records, warnings };
}

export function removeRecord(dir: string, instanceId: string): void {
  if (!UUID.test(instanceId)) throw new Error("Invalid instance ID");
  try {
    prepareDir(dir, false);
    const path = join(dir, `${instanceId}.json`);
    readRecord(path, instanceId);
    unlinkSync(path);
  } catch (error) {
    if (!missing(error)) throw error;
  }
}
