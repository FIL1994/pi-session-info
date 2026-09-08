import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { Overview } from "../core/types";
import type { HistorySnapshot, SavedSession } from "./reader";

function fileKey(file: string): string {
  try { return realpathSync(file); } catch { return resolve(file); }
}

/** Exact file identity only; absence is not evidence that a parent is gone. */
export function parentMatch(child: SavedSession, sessions: readonly SavedSession[]): "matched" | "unavailable" | "unknown" {
  if (!child.parentSessionFile) return "unknown";
  return sessions.some((candidate) => fileKey(candidate.sessionFile) === fileKey(child.parentSessionFile!)) ? "matched" : "unavailable";
}

/** History is persisted metadata, never evidence of idle or stopped activity. */
export function recentSessions(history: HistorySnapshot, live: Overview, current?: {
  sessionId?: string | undefined; sessionFile?: string | undefined;
}): HistorySnapshot {
  const ids = new Set(live.sessions.flatMap((row) => row.sessionId ? [row.sessionId] : []));
  const files = new Set(live.sessions.flatMap((row) => row.sessionFile ? [fileKey(row.sessionFile)] : []));
  if (current?.sessionId) ids.add(current.sessionId);
  if (current?.sessionFile) files.add(fileKey(current.sessionFile));
  const seenIds = new Set<string>();
  const seenFiles = new Set<string>();
  const sessions = [...history.sessions]
    .sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt) || a.sessionFile.localeCompare(b.sessionFile))
    .filter((row) => {
      const file = fileKey(row.sessionFile);
      if (ids.has(row.sessionId) || files.has(file) || seenIds.has(row.sessionId) || seenFiles.has(file)) return false;
      seenIds.add(row.sessionId); seenFiles.add(file);
      return true;
    });
  return { sessions, warnings: [
    ...history.warnings,
    ...(live.sessions.some((row) => !row.sessionId && !row.sessionFile)
      ? ["Some running sessions are not connected; their saved history may still appear here."] : []),
    ...live.warnings,
  ] };
}

export function savedDetails(row: SavedSession, snapshot?: readonly SavedSession[]): string[] {
  return [row.name ?? "Saved session", `Directory: ${row.cwd}`, `Session: ${row.sessionId}`,
    `File: ${row.sessionFile}`, `Last saved (file modified): ${row.modifiedAt}`,
    `Derived from: ${row.parentSessionFile ?? "Unknown (no parent metadata)"}`,
    ...(snapshot && row.parentSessionFile ? [parentMatch(row, snapshot) === "matched"
      ? "Parent file matched in saved snapshot (not evidence of liveness)."
      : "Parent file not in saved snapshot (may be outside discovery coverage)."] : []),
    "Saved metadata only; no live activity is inferred. Use /resume to continue a session."];
}
