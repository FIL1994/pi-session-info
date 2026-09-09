import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { dirname } from "node:path";
import { liveOverview } from "../inventory";
import { readHistory, type HistorySnapshot } from "../history/reader";
import { recentSessions } from "../history/recent";

export interface ListPiSessionsDeps {
  overview?: typeof liveOverview;
  history?: typeof readHistory;
  now?: () => number;
}

const schema = Type.Object({
  scope: Type.Optional(
    Type.Union([Type.Literal("running"), Type.Literal("recent"), Type.Literal("both")]),
  ),
  groupByCwd: Type.Optional(Type.Boolean()),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, maximum: 10000 })),
});

/** Agent-facing metadata inventory. It deliberately does not use history for the default scope. */
export function registerListPiSessionsTool(pi: ExtensionAPI, deps: ListPiSessionsDeps = {}): void {
  const getOverview = deps.overview ?? liveOverview;
  const getHistory = deps.history ?? readHistory;
  pi.registerTool({
    name: "list_pi_sessions",
    label: "List Pi Sessions",
    description:
      "List Pi session metadata for repo auditing. Default scope is running; use recent or both for saved metadata. Pagination uses limit/offset, and groupByCwd groups only this page by exact cwd. Saved sessions are not evidence of stopped or idle state; discovery is best effort.",
    parameters: schema,
    async execute(_id, params, signal, _onUpdate, ctx) {
      signal?.throwIfAborted();
      const scope = params.scope ?? "running";
      const live = getOverview();
      signal?.throwIfAborted();
      const historyDirectories = new Set<string>();
      let history: HistorySnapshot | undefined;
      if (scope !== "running") {
        for (const row of live.sessions)
          if (row.sessionFile) historyDirectories.add(dirname(row.sessionFile));
        const currentDir = ctx.sessionManager?.getSessionDir();
        if (currentDir) historyDirectories.add(currentDir);
        history = await getHistory({
          directories: [...historyDirectories],
          ...(signal ? { signal } : {}),
        });
        signal?.throwIfAborted();
        if (history.failed) throw new Error("History scan failed");
      }
      const recentSnapshot: HistorySnapshot | undefined = history
        ? recentSessions(history, live, {
            sessionId: ctx.sessionManager?.getSessionId(),
            sessionFile: ctx.sessionManager?.getSessionFile(),
          })
        : undefined;
      const recent = recentSnapshot?.sessions ?? [];
      const all = [
        ...(scope !== "recent"
          ? live.sessions.map((session) => ({ kind: "running" as const, session }))
          : []),
        ...(scope !== "running"
          ? recent.map((session) => ({ kind: "recent" as const, session }))
          : []),
      ];
      const offset = params.offset ?? 0;
      const limit = params.limit ?? 100;
      const page = all.slice(offset, offset + limit);
      const groups = params.groupByCwd
        ? [...new Set(page.map((x) => x.session.cwd))].map((cwd) => ({
            cwd,
            sessions: page.filter((x) => x.session.cwd === cwd),
          }))
        : undefined;
      const result = {
        schemaVersion: 1,
        generatedAt: new Date((deps.now ?? Date.now)()).toISOString(),
        scope,
        sessions: page,
        ...(groups ? { groups } : {}),
        counts: { total: all.length, offset, returned: page.length },
        nextOffset: offset + page.length < all.length ? offset + page.length : null,
        historyDirectories: [...historyDirectories],
        projectDirectories: [...new Set(page.map((item) => item.session.cwd))],
        coverage: {
          complete: false,
          limitations: [
            "Linux-only best-effort process discovery",
            "saved metadata does not identify live or stopped sessions",
            "unconnected custom session directories are unavailable",
            "cwd values are not git roots",
            "grouping covers only this page and each call performs a fresh scan",
          ],
        },
        warnings: [...new Set(recentSnapshot?.warnings ?? live.warnings)],
      };
      return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
    },
  });
}
