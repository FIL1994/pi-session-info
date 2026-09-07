import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { liveOverview } from "../inventory";
import { formatDetails, projectLabel, statusLabel, terminalText } from "../format";
import { registerLifecycle } from "./lifecycle";

export default function sessionInfo(pi: ExtensionAPI) {
  registerLifecycle(pi);
  registerSessionsCommand(pi);
}

export function registerSessionsCommand(pi: ExtensionAPI, dependencies = { overview: liveOverview, pid: process.pid }) {
  pi.registerCommand("sessions", {
    description: "List Pi sessions with live status and process-only fallback",
    handler: async (args, ctx) => {
      if (args.trim()) {
        if (ctx.hasUI) ctx.ui.notify("Usage: /sessions", "warning");
        return;
      }
      if (!ctx.hasUI) return;
      try {
        for (;;) {
          const overview = dependencies.overview();
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
            `PID ${row.pid}${row.pid === dependencies.pid ? " (this session)" : ""}`,
          ].filter(Boolean).join(" · ")));
          const choice = await ctx.ui.select(title, [...details, "Refresh", "Close"]);
          if (!choice || choice === "Close") break;
          const row = overview.sessions[details.indexOf(choice)];
          if (row) await ctx.ui.select(formatDetails(row), ["Back"]);
        }
      } catch {
        ctx.ui.notify("Could not list sessions. Check Linux /proc access and the registry directory configuration.", "error");
      }
    },
  });
}
