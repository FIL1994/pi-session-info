import { closeSync, constants, fstatSync, openSync, readSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { preparePrivateDir } from "./registry/store";

export interface PinStore {
  isPinned(sessionId: string): boolean;
  setPinned(sessionId: string, pinned: boolean): void;
}

export function resolvePinsDir(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  const base = env.XDG_STATE_HOME?.startsWith("/") ? env.XDG_STATE_HOME : join(home, ".local", "state");
  return join(base, "pi-session-info", "pins");
}

/** One atomic file per session avoids lost updates between independent Pi instances. */
export function createPinStore(directory = resolvePinsDir()): PinStore {
  function path(id: string) {
    if (!id || id.length > 4096) throw Error("Invalid pin identity");
    return join(directory, `${createHash("sha256").update(id).digest("hex")}.json`);
  }
  function isPinned(id: string): boolean {
    const file = path(id);
    try {
      preparePrivateDir(directory, false);
      const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const stat = fstatSync(fd);
        if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) || stat.size > 32_768) throw Error("Unsafe pin file");
        const buffer = Buffer.alloc(32_769);
        let length = 0;
        while (length < buffer.length) {
          const n = readSync(fd, buffer, length, buffer.length - length, null);
          if (!n) break;
          length += n;
        }
        if (length > 32_768) throw Error("Oversized pin file");
        const value: unknown = JSON.parse(buffer.subarray(0, length).toString("utf8"));
        if (!value || typeof value !== "object" || Array.isArray(value) ||
          Object.keys(value).sort().join(",") !== "schemaVersion,sessionId" ||
          (value as { schemaVersion?: unknown }).schemaVersion !== 1 ||
          (value as { sessionId?: unknown }).sessionId !== id) throw Error("Invalid pin file");
        return true;
      } finally { closeSync(fd); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }
  return { isPinned, setPinned(id, pinned) {
    const file = path(id);
    // Refuse unsafe/corrupt existing state, even when removing a pin.
    const exists = isPinned(id);
    if (!pinned) {
      if (exists) {
        try { unlinkSync(file); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
      return;
    }
    preparePrivateDir(directory, true);
    const tmp = join(directory, `.${randomUUID()}.tmp`);
    let fd: number | undefined;
    try {
      fd = openSync(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      writeFileSync(fd, JSON.stringify({ schemaVersion: 1, sessionId: id }));
      closeSync(fd); fd = undefined;
      renameSync(tmp, file);
    } finally {
      if (fd !== undefined) closeSync(fd);
      try { unlinkSync(tmp); } catch { /* Atomic rename removed the temporary file. */ }
    }
  } };
}
