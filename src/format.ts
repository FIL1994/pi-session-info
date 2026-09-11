import { basename } from "node:path";
import type { Overview, SessionRow } from "./core/types";

/** Escape terminal control bytes, including ESC/OSC, rather than executing them. */
export function terminalText(value: string): string {
  return value.replace(
    // oxlint-disable-next-line no-control-regex -- Intentionally escape terminal control bytes.
    /[\u0000-\u001f\u007f-\u009f]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/** Presentation only: saved age never implies idle or stopped activity. */
export function relativeTime(value: string, now: number): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time) || !Number.isFinite(now)) return "Date unavailable";
  const seconds = Math.floor(Math.abs(now - time) / 1000);
  if (seconds < 60) return time > now ? "in less than a minute" : "just now";
  const [size, unit] =
    seconds < 3600
      ? ([60, "minute"] as const)
      : seconds < 86400
        ? ([3600, "hour"] as const)
        : ([86400, "day"] as const);
  const count = Math.floor(seconds / size);
  const label = `${count} ${unit}${count === 1 ? "" : "s"}`;
  return time > now ? `in ${label}` : `${label} ago`;
}

/** Return an honest age for observed changes; unavailable dates stay unknown. */
export function observedChangeAge(value: string | null | undefined, now: number): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && Number.isFinite(now) ? relativeTime(value, now) : null;
}

export function statusLabel(row: SessionRow): string {
  if (row.evidence === "unmatched") return "Not connected";
  const labels = {
    working: "Working",
    tool: "Using tools",
    "waiting-user": "Waiting for you",
    idle: "Idle",
    unknown: "Activity unavailable",
  };
  const label = labels[row.activity];
  if (row.freshness !== "fresh")
    return `Stale · last ${row.evidence === "inferred" ? "inferred" : "observed"}: ${label}`;
  return row.evidence === "inferred" ? `Inferred: ${label}` : label;
}

export function projectLabel(
  row: { cwd: string },
  overview: { sessions: readonly { cwd: string }[] },
): string {
  const name = basename(row.cwd) || row.cwd;
  const collision = overview.sessions.some(
    (other) => other.cwd !== row.cwd && (basename(other.cwd) || other.cwd) === name,
  );
  return collision ? row.cwd : name;
}

export function formatOverview(
  overview: Overview,
  options: { currentProcessIdentity?: string | null; now?: number } = {},
): string {
  const generatedAt = overview.generatedAt ? Date.parse(overview.generatedAt) : Number.NaN;
  const now = options.now ?? (Number.isFinite(generatedAt) ? generatedAt : Date.now());
  const connected = overview.sessions.filter(
    (row) => row.evidence === "extension" && row.freshness === "fresh",
  ).length;
  const stale = overview.sessions.filter(
    (row) => row.evidence === "extension" && row.freshness !== "fresh",
  ).length;
  const rows = overview.sessions.map((row) => {
    const changeAge = observedChangeAge(row.activityAt, now);
    const heading = [
      projectLabel(row, overview),
      `PID ${row.pid}`,
      row.processIdentity && row.processIdentity === options.currentProcessIdentity
        ? "this process"
        : "",
    ]
      .filter(Boolean)
      .map(terminalText)
      .join(" · ");
    const detail = [
      statusLabel(row),
      row.name,
      row.model,
      row.thinking ? `thinking: ${row.thinking}` : null,
      row.activeTools.length ? row.activeTools.join(", ") : null,
      changeAge ? `last observed change: ${changeAge}` : null,
    ]
      .filter(Boolean)
      .map((value) => terminalText(value!))
      .join(" · ");
    return `${heading}\n  ${detail}`;
  });
  return [
    `Pi sessions (${overview.source})`,
    `${overview.sessions.length} listed · ${connected} connected${stale ? ` · ${stale} stale` : ""}`,
    "",
    ...rows,
    ...(rows.length ? [] : ["No running Pi sessions found."]),
    ...(overview.sessions.some((row) => row.evidence === "unmatched")
      ? [
          "",
          "Not connected: process found, but no live status. Load this extension in that Pi session, then /reload.",
        ]
      : []),
    ...(connected + stale
      ? ["", "Status covers the observed Pi loop, not independent background agents."]
      : []),
    ...overview.warnings.map((warning) => `Note: ${terminalText(warning)}`),
  ].join("\n");
}

export function formatDetails(row: SessionRow): string {
  return [
    row.name ?? (basename(row.cwd) || row.cwd),
    `Directory: ${row.cwd}`,
    `PID: ${row.pid}`,
    `Status: ${statusLabel(row)}`,
    `Evidence: ${row.evidence} · ${row.freshness}`,
    ...(row.sessionId ? [`Session: ${row.sessionId}`] : []),
    ...(row.parentSessionFile
      ? [`Derived from: ${row.parentSessionFile} (saved metadata; parent live state not checked)`]
      : ["Derived from: Unknown (no parent metadata)"]),
    ...(row.model ? [`Model: ${row.provider ? `${row.provider}/` : ""}${row.model}`] : []),
    ...(row.thinking ? [`Thinking: ${row.thinking}`] : []),
    ...(row.mode ? [`Mode: ${row.mode}`] : []),
    ...(row.activeTools.length ? [`Tools: ${row.activeTools.join(", ")}`] : []),
    ...(row.activityAt ? [`Activity changed: ${row.activityAt}`] : []),
    ...(row.heartbeatAt ? [`Last report: ${row.heartbeatAt}`] : []),
  ]
    .map(terminalText)
    .join("\n");
}
