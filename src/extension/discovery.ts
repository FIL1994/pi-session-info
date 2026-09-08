import { PROCESS_DISCOVERY_LIMITATION } from "../discover";
import { terminalText } from "../format";
import type { SessionPage } from "./picker";

/** Keep the CLI's warning contract; move only known boilerplate into UI help. */
export function scanWarnings(warnings: string[]): string[] {
  return [...new Set(warnings)].filter((warning) => warning !== PROCESS_DISCOVERY_LIMITATION);
}

export function discoveryText(page: SessionPage): string {
  const issues = page.warnings.length
    ? page.warnings.map((warning) => `• ${terminalText(warning)}`).join("\n\n")
    : page.updatedAt === undefined
      ? "No snapshot loaded yet. Return to the list and press r to try again."
      : "No scan warnings reported. This does not guarantee every session was found.";
  const help = page.tab === "Running" ? [
    "• Connected: the extension reports activity for a detected running Pi process.",
    "• Not connected: the process was found, but its activity is unknown. Load this extension in that Pi session; if already configured, run /reload there.",
    "• Stale: the last activity report is out of date. It does not mean the session is idle. Refresh; if it stays stale, check the extension in that session.",
    "• Limits: without the extension, discovery only recognizes processes named pi. Node-launched instances may be missed. Background agents are not tracked independently.",
  ] : [
    "• Recent lists saved session files, newest file modification first. Saved age does not tell you whether a session is running, stopped, or idle.",
    "• Your current session and exact matches to known running sessions are excluded. Unconnected or undetected sessions can still appear here.",
    "• The list starts with 15 sessions; Show more adds 10. Files outside scanned locations or scan limits may be missing.",
    "• To continue a session, use /resume. This list only shows metadata; it does not switch sessions.",
  ];
  return [
    terminalText(page.summary),
    ...(page.notice ? [`Latest attempt\n${terminalText(page.notice)}`] : []),
    `Scan results\n${issues}`,
    ...(page.warnings.length ? ["What to do\nReturn to the list and press r to retry. For unreadable files, check access to the configured session or registry. Scan limits mean the snapshot may remain incomplete."] : []),
    `How ${page.tab} works\n${help.join("\n\n")}`,
    "Snapshots do not update automatically. Press r in the session list to refresh.",
  ].join("\n\n");
}
