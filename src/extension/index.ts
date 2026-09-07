import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { dirname } from "node:path";
import { liveOverview } from "../inventory";
import { formatDetails, projectLabel, statusLabel, terminalText } from "../format";
import { registerLifecycle } from "./lifecycle";
import { readHistory, type HistorySnapshot } from "../history/reader";
import { recentSessions, savedDetails } from "../history/recent";
import { selectSessionPage, type SessionsTab } from "./picker";

/** A blocking prompt cannot resolve faster than this; instant returns mean nobody is answering. */
const MIN_PROMPT_MS = 5;
const MAX_IMMEDIATE_PROMPTS = 50;

export interface SessionsDeps {
  overview?: typeof liveOverview;
  pid?: number;
  now?: () => number;
  history?: typeof readHistory;
}

export default function sessionInfo(pi: ExtensionAPI) {
  registerLifecycle(pi);
  registerSessionsCommand(pi);
}

export function registerSessionsCommand(pi: ExtensionAPI, dependencies: SessionsDeps = {}) {
  const inventory = dependencies.overview ?? liveOverview;
  const self = dependencies.pid ?? process.pid;
  const clock = dependencies.now ?? Date.now;
  const historyReader = dependencies.history ?? readHistory;
  pi.registerCommand("sessions", {
    description: "Browse running Pi sessions and recent saved sessions",
    handler: async (args, ctx) => {
      if (args.trim()) {
        if (ctx.hasUI) ctx.ui.notify("Usage: /sessions", "warning");
        return;
      }
      if (!ctx.hasUI) return;
      try {
        let immediate = 0;
        let tab: SessionsTab = "Running";
        let limit = 10;
        let recentSelection = 0;
        let history: HistorySnapshot | undefined;
        for (;;) {
          const overview = inventory();
          if (tab === "Recent") {
            if (!history) {
              const directories = overview.sessions.flatMap((row) => row.sessionFile ? [dirname(row.sessionFile)] : []);
              const currentDir = ctx.sessionManager?.getSessionDir();
              if (currentDir) directories.push(currentDir);
              try { history = await historyReader({ directories }); }
              catch { history = { sessions: [], warnings: ["Could not read saved sessions. Check session directory access and Refresh to retry."] }; }
            }
            // Capture again after the asynchronous disk scan: a session may have resumed meanwhile.
            const recent = recentSessions(history, inventory(), {
              sessionId: ctx.sessionManager?.getSessionId(), sessionFile: ctx.sessionManager?.getSessionFile(),
            });
            const rows = recent.sessions.slice(0, limit);
            const labels = rows.map((row, index) => terminalText(`${index + 1}. ${projectLabel(row, recent)} · ${row.name ?? row.sessionId} · ${row.modifiedAt}`));
            const title = [
              `Recent sessions · ${rows.length} of ${recent.sessions.length}`,
              "Newest saved files first · matched running sessions excluded.",
              ...(rows.length ? [] : ["No recent saved sessions found."]), ...recent.warnings,
            ].map(terminalText).join("\n");
            const started = clock();
            const choice = await selectSessionPage(ctx, tab, title, [...labels,
              ...(recent.sessions.length > limit ? ["Show more"] : []), "Refresh", "Close"], recentSelection);
            if (!choice || choice === "Close") break;
            immediate = clock() - started < MIN_PROMPT_MS ? immediate + 1 : 0;
            if (immediate >= MAX_IMMEDIATE_PROMPTS) {
              ctx.ui.notify("Closed /sessions: the selection prompt stopped waiting for input.", "warning"); break;
            }
            if (choice === "Running") tab = "Running";
            if (choice === "Show more") { recentSelection = rows.length; limit += 10; }
            if (choice === "Refresh") { history = undefined; recentSelection = 0; }
            const row = rows[labels.indexOf(choice)];
            if (row) {
              recentSelection = labels.indexOf(choice);
              await ctx.ui.select(savedDetails(row).map(terminalText).join("\n"), ["Back"]);
            }
            continue;
          }
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
          const choice = await selectSessionPage(ctx, tab, title, [...details, "Refresh", "Close"]);
          if (!choice || choice === "Close") break;
          // Never rescan /proc in a hot loop when the host stops blocking on selection.
          immediate = clock() - started < MIN_PROMPT_MS ? immediate + 1 : 0;
          if (immediate >= MAX_IMMEDIATE_PROMPTS) {
            ctx.ui.notify("Closed /sessions: the selection prompt stopped waiting for input.", "warning");
            break;
          }
          if (choice === "Recent") tab = "Recent";
          if (choice === "Refresh") history = undefined;
          const row = overview.sessions[details.indexOf(choice)];
          if (row) await ctx.ui.select(formatDetails(row), ["Back"]);
        }
      } catch {
        ctx.ui.notify("Could not list sessions. Check Linux /proc access and the registry directory configuration.", "error");
      }
    },
  });
}
