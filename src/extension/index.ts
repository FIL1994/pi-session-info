import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { dirname } from "node:path";
import { liveOverview } from "../inventory";
import type { Overview } from "../core/types";
import { formatDetails, projectLabel, relativeTime, statusLabel, terminalText } from "../format";
import { registerLifecycle } from "./lifecycle";
import { readHistory, type HistorySnapshot } from "../history/reader";
import { recentSessions, savedDetails } from "../history/recent";
import { loadSessionPage, selectSessionPage, showCoverage, type SessionPage, type SessionsTab } from "./picker";
import { createPinStore, type PinStore } from "../pins";

export interface SessionsDeps {
  overview?: typeof liveOverview;
  pid?: number;
  now?: () => number;
  history?: typeof readHistory;
  pins?: PinStore;
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
  const pins = dependencies.pins ?? createPinStore();
  async function showDetails(ctx: ExtensionCommandContext, title: string, sessionId: string | null) {
    let pinned: boolean | undefined;
    try { if (sessionId) pinned = pins.isPinned(sessionId); }
    catch { ctx.ui.notify("Could not read pin metadata. Check the private pins directory.", "warning"); }
    const action = pinned ? "Unpin session" : "Pin session";
    const choice = await ctx.ui.select(title, [...(pinned === undefined ? [] : [action]), "Back"]);
    if (sessionId && pinned !== undefined && choice === action) {
      try { pins.setPinned(sessionId, !pinned); ctx.ui.notify(pinned ? "Session unpinned." : "Session pinned.", "info"); }
      catch { ctx.ui.notify("Could not save pin metadata. Session files were not changed.", "error"); }
    }
  }
  pi.registerCommand("sessions", {
    description: "Browse running Pi sessions and recent saved sessions",
    handler: async (args, ctx) => {
      if (args.trim()) { if (ctx.hasUI) ctx.ui.notify("Usage: /sessions", "warning"); return; }
      if (!ctx.hasUI) return;
      let tab: SessionsTab = "Running";
      let limit = 10;
      let pinnedOnly = false;
      let overview: Overview = { schemaVersion: 1, source: "live", sessions: [], warnings: [] };
      let history: HistorySnapshot | undefined;
      const selected: Partial<Record<SessionsTab, string>> = {};
      const updated: Partial<Record<SessionsTab, number>> = {};
      const notices: Partial<Record<SessionsTab, string>> = {};
      let refresh = true;
      let immediate = 0;
      try {
        for (;;) {
          const now = clock();
          const recent = tab === "Recent" ? recentSessions(history ?? { sessions: [], warnings: [] }, overview, {
            sessionId: ctx.sessionManager?.getSessionId(), sessionFile: ctx.sessionManager?.getSessionFile(),
          }) : { sessions: [], warnings: [] };
          let pinReadFailed = false;
          const pinCache = new Map<string, boolean>();
          const isPinned = (id: string) => {
            if (!pinCache.has(id)) {
              try { pinCache.set(id, pins.isPinned(id)); }
              catch { pinReadFailed = true; pinCache.set(id, false); }
            }
            return pinCache.get(id)!;
          };
          const filtered = pinnedOnly ? recent.sessions.filter((row) => isPinned(row.sessionId)) : recent.sessions;
          const saved = filtered.slice(0, limit);
          const connected = overview.sessions.filter((row) => row.evidence === "extension" && row.freshness === "fresh").length;
          const stale = overview.sessions.filter((row) => row.evidence === "extension" && row.freshness !== "fresh").length;
          const page: SessionPage = {
            tab, now, clock,
            summary: tab === "Running" ? `${overview.sessions.length} running · ${connected} connected${stale ? ` · ${stale} stale` : ""}`
              : `Recent sessions${pinnedOnly ? " · Pinned" : ""} · ${saved.length} of ${filtered.length}`,
            rows: tab === "Running" ? overview.sessions.map((row) => ({
              id: `live:${row.instanceId}`, project: projectLabel(row, overview), name: row.name ?? `PID ${row.pid}`,
              meta: `${statusLabel(row)} · ${row.model ?? ""} · PID ${row.pid}${row.pid === self ? " (this session)" : ""}`,
            })) : saved.map((row) => ({
              id: `saved:${row.sessionId}`, project: projectLabel(row, recent), name: row.name ?? row.sessionId,
              pinned: isPinned(row.sessionId), savedAt: row.modifiedAt, meta: `saved ${relativeTime(row.modifiedAt, now)}`,
            })),
            actions: [...(tab === "Recent" ? [...(filtered.length > limit ? ["Show more"] : []), pinnedOnly ? "All recent" : "Pinned only"] : []), "Refresh", "Coverage details", "Close"],
            coverage: tab === "Running" ? [...overview.warnings,
              "Not connected = process only. Load this extension in that session, then /reload.",
              "Status covers the Pi loop, not independent background agents. Stale reports retain last observed activity."]
              : [...recent.warnings, "Newest saved files first; exact matched running sessions are excluded. Saved age never implies idle.",
                ...(pinReadFailed ? ["Some pin metadata could not be read; pinned coverage may be incomplete."] : [])],
            empty: tab === "Running" ? "No running Pi sessions found." : !history ? "Saved sessions not loaded. Refresh to retry."
              : pinnedOnly ? "No pinned sessions available in this history snapshot." : "No recent saved sessions found.",
            ...(updated[tab] !== undefined ? { updatedAt: updated[tab] } : {}),
            ...(selected[tab] ? { selectedId: selected[tab] } : {}),
            ...(notices[tab] ? { notice: notices[tab] } : {}),
          };
          if (refresh) {
            refresh = false;
            const result = await loadSessionPage(ctx, page, tab === "Recent" ? "Loading saved sessions…" : "Refreshing running sessions…", async (signal) => {
              signal.throwIfAborted();
              const live = inventory();
              if (tab === "Running") return { live };
              const directories = live.sessions.flatMap((row) => row.sessionFile ? [dirname(row.sessionFile)] : []);
              const currentDir = ctx.sessionManager?.getSessionDir();
              if (currentDir) directories.push(currentDir);
              const next = await historyReader({ directories, signal });
              signal.throwIfAborted();
              if (next.failed) throw Error("History scan failed");
              // Refresh live mapping after asynchronous reads, before committing the snapshot.
              return { live: inventory(), history: next };
            });
            if (result.status === "ok") {
              overview = result.value.live;
              if (result.value.history) history = result.value.history;
              updated.Running = clock(); updated[tab] = updated.Running;
              delete notices.Running;
              delete notices[tab];
            } else {
              notices[tab] = result.status === "cancelled" ? "Loading cancelled · previous snapshot retained · Refresh to retry"
                : "Refresh failed · previous snapshot retained · Refresh to retry";
              if (updated[tab] === undefined) notices[tab] = result.status === "cancelled" ? "Loading cancelled · Refresh to retry" : "Could not load sessions · Refresh to retry";
            }
            continue;
          }
          const started = clock();
          const choice = await selectSessionPage(ctx, page, (id) => { selected[tab] = id; });
          if (!choice || choice === "Close") break;
          immediate = clock() - started < 5 ? immediate + 1 : 0;
          if (immediate >= 50) { ctx.ui.notify("Closed /sessions: the selection prompt stopped waiting for input.", "warning"); break; }
          if (choice === "Running" || choice === "Recent") {
            tab = choice;
            // Do not automatically retry a previously cancelled/failed scan.
            refresh = updated[tab] === undefined && !notices[tab];
          } else if (choice === "Refresh") refresh = true;
          else if (choice === "Coverage details") await showCoverage(ctx, page.coverage);
          else if (choice === "Pinned only" || choice === "All recent") {
            pinnedOnly = choice === "Pinned only"; limit = 10; delete selected.Recent;
          } else if (choice === "Show more") {
            const next = filtered[limit]; if (next) selected.Recent = `saved:${next.sessionId}`;
            limit += 10;
          } else if (tab === "Running") {
            const row = overview.sessions.find((row) => `live:${row.instanceId}` === choice);
            if (row) await showDetails(ctx, formatDetails(row), row.sessionId);
          } else {
            const row = saved.find((row) => `saved:${row.sessionId}` === choice);
            if (row) await showDetails(ctx, savedDetails(row).map(terminalText).join("\n"), row.sessionId);
          }
        }
      } catch { ctx.ui.notify("Could not display sessions. Close and retry /sessions.", "error"); }
    },
  });
}
