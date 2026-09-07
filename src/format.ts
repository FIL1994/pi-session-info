import { basename } from "node:path";
import type { Overview, SessionRow } from "./core/types";

/** Escape terminal control bytes, including ESC/OSC, rather than executing them. */
export function terminalText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, (char) =>
    `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

export function statusLabel(row: SessionRow): string {
  if (row.evidence === "unmatched") return "Not connected";
  const labels = { working: "Working", tool: "Using tools", "waiting-user": "Waiting for you", idle: "Idle", unknown: "Activity unavailable" };
  const label = labels[row.activity];
  if (row.freshness !== "fresh") return `Stale · last ${row.evidence === "inferred" ? "inferred" : "observed"}: ${label}`;
  return row.evidence === "inferred" ? `Inferred: ${label}` : label;
}

export function projectLabel(row: SessionRow, overview: Overview): string {
  const name = basename(row.cwd) || row.cwd;
  const collision = overview.sessions.some((other) => other.cwd !== row.cwd && (basename(other.cwd) || other.cwd) === name);
  return collision ? row.cwd : name;
}

export function formatOverview(overview: Overview, options: { currentPid?: number } = {}): string {
  const connected = overview.sessions.filter((row) => row.evidence === "extension" && row.freshness === "fresh").length;
  const stale = overview.sessions.filter((row) => row.evidence === "extension" && row.freshness !== "fresh").length;
  const rows = overview.sessions.map((row) => {
    const heading = [projectLabel(row, overview), `PID ${row.pid}`, row.pid === options.currentPid ? "this session" : ""].filter(Boolean).map(terminalText).join(" · ");
    const detail = [statusLabel(row), row.name, row.model, row.thinking ? `thinking: ${row.thinking}` : null,
      row.activeTools.length ? row.activeTools.join(", ") : null].filter(Boolean).map((value) => terminalText(value!)).join(" · ");
    return `${heading}\n  ${detail}`;
  });
  return [
    `Pi sessions (${overview.source})`,
    `${overview.sessions.length} listed · ${connected} connected${stale ? ` · ${stale} stale` : ""}`,
    "",
    ...rows,
    ...(rows.length ? [] : ["No running Pi sessions found."]),
    ...(overview.sessions.some((row) => row.evidence === "unmatched") ? ["", "Not connected: process found, but no live status. Load this extension in that Pi session, then /reload."] : []),
    ...(connected + stale ? ["", "Status covers the observed Pi loop, not independent background agents."] : []),
    ...overview.warnings.map((warning) => `Note: ${terminalText(warning)}`),
  ].join("\n");
}

export function formatDetails(row: SessionRow): string {
  return [
    row.name ?? (basename(row.cwd) || row.cwd),
    `Directory: ${row.cwd}`, `PID: ${row.pid}`, `Status: ${statusLabel(row)}`,
    `Evidence: ${row.evidence} · ${row.freshness}`,
    ...(row.sessionId ? [`Session: ${row.sessionId}`] : []),
    ...(row.model ? [`Model: ${row.provider ? `${row.provider}/` : ""}${row.model}`] : []),
    ...(row.thinking ? [`Thinking: ${row.thinking}`] : []),
    ...(row.mode ? [`Mode: ${row.mode}`] : []),
    ...(row.activeTools.length ? [`Tools: ${row.activeTools.join(", ")}`] : []),
    ...(row.activityAt ? [`Activity changed: ${row.activityAt}`] : []),
    ...(row.heartbeatAt ? [`Last report: ${row.heartbeatAt}`] : []),
  ].map(terminalText).join("\n");
}
