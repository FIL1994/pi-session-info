import { constants } from "node:fs";
import { lstat, open, opendir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { setImmediate as yieldToEventLoop } from "node:timers/promises";

export interface SavedSession {
  sessionId: string;
  sessionFile: string;
  cwd: string;
  name: string | null;
  modifiedAt: string;
}
export interface HistorySnapshot { sessions: SavedSession[]; warnings: string[]; failed?: boolean }

const MAX_ENTRIES = 10_000;
const MAX_FILES = 2_000;
const HEAD_BYTES = 64 * 1024;
const TAIL_BYTES = 256 * 1024;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 4096;
}
function expand(path: string): string {
  return resolve(path === "~" ? homedir() : path.startsWith("~/") ? join(homedir(), path.slice(2)) : path);
}

/** Read-only v3 metadata. Bounded head/tail windows never retain transcript content. */
export async function readHistory(options: { directories?: string[]; agentDir?: string; signal?: AbortSignal; yieldToUI?: () => Promise<void> } = {}): Promise<HistorySnapshot> {
  const check = () => options.signal?.throwIfAborted();
  check();
  const counts = new Map<string, number>();
  const note = (reason: string) => counts.set(reason, (counts.get(reason) ?? 0) + 1);
  const sessions = new Map<string, SavedSession>();
  const seenDirs = new Set<string>();
  const seenFiles = new Set<string>();
  let entries = 0;
  let files = 0;
  let limited = false;
  const yieldToUI = async () => {
    check();
    await (options.yieldToUI ?? yieldToEventLoop)();
    check();
  };

  async function inspect(path: string): Promise<void> {
    check();
    if (seenFiles.has(path)) return;
    seenFiles.add(path);
    if (files >= MAX_FILES) { limited = true; return; }
    files++;
    try {
      const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const before = await fd.stat();
        if (!before.isFile() || (process.getuid && before.uid !== process.getuid())) {
          note("unsafe or non-regular files skipped"); return;
        }
        async function window(start: number, size: number): Promise<Buffer> {
          const buffer = Buffer.alloc(size);
          let offset = 0;
          while (offset < size) {
            check();
            const { bytesRead } = await fd.read(buffer, offset, size - offset, start + offset);
            if (!bytesRead) throw Error("changed file");
            offset += bytesRead;
          }
          return buffer;
        }
        const head = await window(0, Math.min(HEAD_BYTES, before.size));
        const end = head.indexOf(10);
        if (end < 0) { note("invalid or oversized session headers skipped"); return; }
        let header: unknown;
        try { header = JSON.parse(head.subarray(0, end).toString("utf8")); }
        catch { note("invalid or oversized session headers skipped"); return; }
        if (!object(header) || header.type !== "session" || header.version !== 3 || !text(header.id) || !text(header.cwd)) {
          note("invalid or unsupported session headers skipped (requires v3)"); return;
        }
        const start = Math.max(0, before.size - TAIL_BYTES);
        const tail = await window(start, before.size - start);
        // When bounded, skip the first fragment rather than treating it as a record.
        let offset = start ? tail.indexOf(10) + 1 : 0;
        if (start) note("files read partially (head/tail only; saved names may be unavailable)");
        if (start && !offset) offset = tail.length;
        let name: string | null = null;
        let malformed = false;
        let records = 0;
        while (offset < tail.length) {
          // Cached reads can leave a whole window of parsing on the UI thread.
          // Yield to keyboard/timer events, not just the microtask queue.
          if (++records % 128 === 0) await yieldToUI();
          const newline = tail.indexOf(10, offset);
          if (newline < 0) { note("files with incomplete final records (record skipped)"); break; }
          const line = tail.subarray(offset, newline).toString("utf8");
          offset = newline + 1;
          if (!line.trim()) continue;
          try {
            const entry: unknown = JSON.parse(line);
            if (!object(entry)) { malformed = true; name = null; }
            else if (entry.type === "session_info") name = text(entry.name) ? entry.name : null;
          } catch { malformed = true; name = null; }
        }
        if (malformed) note("files with malformed complete records (metadata may be incomplete)");
        const after = await fd.stat();
        const linked = await lstat(path);
        if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs ||
          !linked.isFile() || linked.dev !== before.dev || linked.ino !== before.ino) {
          note("files changed during reading and skipped"); return;
        }
        const row: SavedSession = { sessionId: header.id, sessionFile: path, cwd: header.cwd, name, modifiedAt: before.mtime.toISOString() };
        const old = sessions.get(row.sessionId);
        if (!old || row.modifiedAt > old.modifiedAt || (row.modifiedAt === old.modifiedAt && path < old.sessionFile)) sessions.set(row.sessionId, row);
      } finally { await fd.close(); }
    } catch { check(); note("unreadable, unsafe, or changed session files skipped"); }
  }

  async function scan(root: string, descend: boolean): Promise<void> {
    check();
    if (limited || seenDirs.has(root)) return;
    seenDirs.add(root);
    try {
      // Reject symlink directory paths, including symlink ancestors. Do not follow
      // aliases into unrelated trees; repeated normalized directories are deduped.
      if (await realpath(root) !== root || !(await lstat(root)).isDirectory()) {
        note("unsafe or non-directory history paths skipped"); return;
      }
      const dir = await opendir(root);
      for await (const entry of dir) {
        check();
        if (limited) break;
        if (entries >= MAX_ENTRIES) { limited = true; break; }
        entries++;
        if (entries % 64 === 0) await yieldToUI();
        const path = join(root, entry.name);
        if (entry.isDirectory() && descend) await scan(path, false);
        else if (entry.name.endsWith(".jsonl")) await inspect(path);
      }
    } catch (error) {
      check();
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") note("history directories could not be read");
    }
  }

  // An injected agentDir isolates fixtures from the developer's session env.
  const agentDir = options.agentDir ?? process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
  const root = options.agentDir ? join(agentDir, "sessions") : process.env.PI_CODING_AGENT_SESSION_DIR || join(agentDir, "sessions");
  for (const directory of [root, ...(options.directories ?? [])]) {
    if (limited) break;
    if (directory.trim()) await scan(expand(directory), true);
  }
  const warnings = [...counts].map(([reason, count]) => `History: ${count} ${reason}.`);
  if (limited) warnings.push(`History scan limit reached (${MAX_ENTRIES} entries / ${MAX_FILES} files); newest-session coverage may be incomplete.`);
  check();
  return {
    sessions: [...sessions.values()].sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt) || a.sessionFile.localeCompare(b.sessionFile)),
    warnings,
    ...(sessions.size === 0 && counts.size > 0 ? { failed: true } : {}),
  };
}
