import type { Overview } from "./core/types";

/** Escape terminal control bytes, including ESC/OSC, rather than executing them. */
export function terminalText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, (char) =>
    `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

export function formatOverview(overview: Overview): string {
  const rows = overview.sessions.map((row) => [
    String(row.pid),
    row.activity,
    row.evidence,
    row.freshness,
    row.model ?? "—",
    row.cwd,
    row.activeTools.join(", ") || "—",
  ].map(terminalText).join("\t"));
  return [
    `Pi sessions (${overview.source})`,
    "PID\tSTATUS\tEVIDENCE\tFRESHNESS\tMODEL\tDIRECTORY\tTOOLS",
    ...rows,
    ...overview.warnings.map((warning) => `Note: ${terminalText(warning)}`),
  ].join("\n");
}
