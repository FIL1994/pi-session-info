import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { dirname } from "node:path";
import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import { liveOverview } from "../inventory";
import type { Overview } from "../core/types";
import { formatDetails, projectLabel, relativeTime, statusLabel, terminalText } from "../format";
import { registerLifecycle } from "./lifecycle";
import { readHistory, type HistorySnapshot } from "../history/reader";
import { recentSessions, savedDetails } from "../history/recent";
import {
  loadSessionPage,
  selectSessionPage,
  showDiscoveryDetails,
  type LoadResult,
  type SessionPage,
  type SessionsTab,
} from "./picker";
import { scanWarnings } from "./discovery";

const RECENT_INITIAL_LIMIT = 15;

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
  async function showDetails(ctx: ExtensionCommandContext, title: string) {
    await ctx.ui.select(title, ["Back"]);
  }
  pi.registerCommand("sessions", {
    description: "Browse running Pi sessions and recent saved sessions",
    handler: async (args, ctx) => {
      if (args.trim()) {
        if (ctx.hasUI) ctx.ui.notify("Usage: /sessions", "warning");
        return;
      }
      if (!ctx.hasUI) return;
      let tab: SessionsTab = "Running";
      let limit = RECENT_INITIAL_LIMIT;
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
          const recent =
            tab === "Recent"
              ? recentSessions(history ?? { sessions: [], warnings: [] }, overview, {
                  sessionId: ctx.sessionManager?.getSessionId(),
                  sessionFile: ctx.sessionManager?.getSessionFile(),
                })
              : { sessions: [], warnings: [] };
          const saved = recent.sessions.slice(0, limit);
          const connected = overview.sessions.filter(
            (row) => row.evidence === "extension" && row.freshness === "fresh",
          ).length;
          const stale = overview.sessions.filter(
            (row) => row.evidence === "extension" && row.freshness !== "fresh",
          ).length;
          const page: SessionPage = {
            tab,
            now,
            clock,
            summary:
              tab === "Running"
                ? `${overview.sessions.length} running · ${connected} connected${stale ? ` · ${stale} stale` : ""}`
                : `Recent sessions · ${history ? `${saved.length} of ${recent.sessions.length}` : "not loaded"}`,
            rows:
              tab === "Running"
                ? overview.sessions.map((row) => ({
                    id: `live:${row.instanceId}`,
                    project: projectLabel(row, overview),
                    name: row.name ?? `PID ${row.pid}`,
                    meta: `${statusLabel(row)} · ${row.model ?? ""}${row.parentSessionFile ? " · derived" : " · ancestry unknown"}${row.pid === self ? " (this session)" : ""}`,
                    pid: `PID ${row.pid}`,
                  }))
                : saved.map((row) => ({
                    id: `saved:${row.sessionId}`,
                    project: projectLabel(row, recent),
                    name: row.name ?? row.sessionId,
                    savedAt: row.modifiedAt,
                    meta: `saved ${relativeTime(row.modifiedAt, now)} · ${row.parentSessionFile ? "derived" : "ancestry unknown"}`,
                  })),
            actions: [
              ...(tab === "Recent" ? (recent.sessions.length > limit ? ["Show more"] : []) : []),
              "Refresh",
              "Discovery details",
              "Close",
            ],
            warnings: scanWarnings(tab === "Running" ? overview.warnings : recent.warnings),
            empty:
              tab === "Running"
                ? "No running Pi sessions found."
                : !history
                  ? "Saved sessions not loaded. Refresh to retry."
                  : "No recent saved sessions found.",
            ...(updated[tab] !== undefined ? { updatedAt: updated[tab] } : {}),
            ...(selected[tab] ? { selectedId: selected[tab] } : {}),
            ...(notices[tab] ? { notice: notices[tab] } : {}),
          };
          if (refresh) {
            refresh = false;
            const result: LoadResult<{ live: Overview; history?: HistorySnapshot }> =
              await loadSessionPage(
                ctx,
                page,
                page.tab === "Recent"
                  ? history
                    ? "Refreshing saved sessions…"
                    : "Loading saved sessions…"
                  : "Refreshing running sessions…",
                async (signal, report) => {
                  signal.throwIfAborted();
                  const live = inventory();
                  if (page.tab === "Running") return { live };
                  const directories = live.sessions.flatMap((row) =>
                    row.sessionFile ? [dirname(row.sessionFile)] : [],
                  );
                  const currentDir = ctx.sessionManager?.getSessionDir();
                  if (currentDir) directories.push(currentDir);
                  const next = await historyReader({ directories, signal, onProgress: report });
                  signal.throwIfAborted();
                  if (next.failed) throw Error("History scan failed");
                  // Refresh live mapping after asynchronous reads, before committing the snapshot.
                  report({ phase: "checking-matches" });
                  await yieldToEventLoop();
                  signal.throwIfAborted();
                  return { live: inventory(), history: next };
                },
                (id) => {
                  selected[page.tab] = id;
                },
              );
            if (result.status === "ok") {
              overview = result.value.live;
              if (result.value.history) history = result.value.history;
              updated.Running = clock();
              updated[tab] = updated.Running;
              delete notices.Running;
              delete notices[tab];
            } else {
              notices[tab] =
                result.status !== "error"
                  ? "Loading cancelled · previous snapshot retained · r Refresh to retry"
                  : "Refresh failed · previous snapshot retained · r Refresh to retry";
              if (updated[tab] === undefined)
                notices[tab] =
                  result.status !== "error"
                    ? "Loading cancelled · r Refresh to retry"
                    : "Could not load sessions · r Refresh to retry";
              if (result.status === "navigate") {
                tab = result.tab;
                refresh = updated[tab] === undefined && !notices[tab];
              }
            }
            continue;
          }
          const started = clock();
          const choice = await selectSessionPage(ctx, page, (id) => {
            selected[tab] = id;
          });
          if (!choice || choice === "Close") break;
          immediate = clock() - started < 5 ? immediate + 1 : 0;
          if (immediate >= 50) {
            ctx.ui.notify(
              "Closed /sessions: the selection prompt stopped waiting for input.",
              "warning",
            );
            break;
          }
          if (choice === "Running" || choice === "Recent") {
            tab = choice;
            // Do not automatically retry a previously cancelled/failed scan.
            refresh = updated[tab] === undefined && !notices[tab];
          } else if (choice === "Refresh") refresh = true;
          else if (choice === "Discovery details") await showDiscoveryDetails(ctx, page);
          else if (choice === "Show more") {
            const next = recent.sessions[limit];
            if (next) selected.Recent = `saved:${next.sessionId}`;
            limit += 10;
          } else if (tab === "Running") {
            const row = overview.sessions.find((row) => `live:${row.instanceId}` === choice);
            if (row) await showDetails(ctx, formatDetails(row));
          } else {
            const row = saved.find((row) => `saved:${row.sessionId}` === choice);
            if (row)
              await showDetails(
                ctx,
                savedDetails(row, history?.sessions).map(terminalText).join("\n"),
              );
          }
        }
      } catch {
        ctx.ui.notify("Could not display sessions. Close and retry /sessions.", "error");
      }
    },
  });
}
