import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { liveOverview } from "../inventory";
import { formatDetails, projectLabel, statusLabel, terminalText } from "../format";
import { registerLifecycle } from "./lifecycle";

/** A blocking prompt cannot resolve faster than this; instant returns mean nobody is answering. */
const MIN_PROMPT_MS = 5;
const MAX_IMMEDIATE_PROMPTS = 50;

export interface SessionsDeps {
  overview?: typeof liveOverview;
  pid?: number;
  now?: () => number;
}

export default function sessionInfo(pi: ExtensionAPI) {
  registerLifecycle(pi);
  registerSessionsCommand(pi);
}

export function registerSessionsCommand(pi: ExtensionAPI, dependencies: SessionsDeps = {}) {
  const inventory = dependencies.overview ?? liveOverview;
  const self = dependencies.pid ?? process.pid;
  const clock = dependencies.now ?? Date.now;
  pi.registerCommand("sessions", {
    description: "List Pi sessions with live status and process-only fallback",
    handler: async (args, ctx) => {
      if (args.trim()) {
        if (ctx.hasUI) ctx.ui.notify("Usage: /sessions", "warning");
        return;
      }
      if (!ctx.hasUI) return;
      try {
        let immediate = 0;
        for (;;) {
          const overview = inventory();
          const connected = overview.sessions.filter((row) => row.evidence === "extension" && row.freshness === "fresh").length;
          const stale = overview.sessions.filter((row) => row.evidence === "extension" && row.freshness !== "fresh").length;
          const title = [
            `Pi sessions · ${overview.sessions.length} listed · ${connected} connected${stale ? ` · ${stale} stale` : ""}`,
            "Select a session for details. This is a snapshot; Refresh updates it.",
            ...(overview.sessions.some((row) => row.evidence === "unmatched") ? ["Not connected = process only. Load this extension in that session, then /reload."] : []),
            ...(connected + stale ? ["Live status covers the Pi loop, not independent background agents."] : []),
            ...overview.warnings,
          ].map(terminalText).join("\n");
          const details = overview.sessions.map((row, index) => terminalText([
            `${index + 1}. ${projectLabel(row, overview)}`, row.name, statusLabel(row), row.model,
            `PID ${row.pid}${row.pid === self ? " (this session)" : ""}`,
          ].filter(Boolean).join(" · ")));
          const started = clock();
          const choice = await ctx.ui.select(title, [...details, "Refresh", "Close"]);
          if (!choice || choice === "Close") break;
          // Never rescan /proc in a hot loop when the host stops blocking on selection.
          immediate = clock() - started < MIN_PROMPT_MS ? immediate + 1 : 0;
          if (immediate >= MAX_IMMEDIATE_PROMPTS) {
            ctx.ui.notify("Closed /sessions: the selection prompt stopped waiting for input.", "warning");
            break;
          }
          const row = overview.sessions[details.indexOf(choice)];
          if (row) await ctx.ui.select(formatDetails(row), ["Back"]);
        }
      } catch {
        ctx.ui.notify("Could not list sessions. Check Linux /proc access and the registry directory configuration.", "error");
      }
    },
  });
}
