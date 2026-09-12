import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { dirname } from "node:path";
import { liveOverview, sharedProcessWarnings } from "../inventory";
import { readHistory, type HistorySnapshot } from "../history/reader";
import { recentSessions } from "../history/recent";
import { observedChangeAge, relativeTime } from "../format";

export interface ListPiSessionsDeps {
  overview?: typeof liveOverview;
  history?: typeof readHistory;
  now?: () => number;
}

const schema = Type.Object({
  scope: Type.Optional(StringEnum(["running", "recent", "both"] as const)),
  groupByCwd: Type.Optional(Type.Boolean()),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, maximum: 10000 })),
  cwd: Type.Optional(Type.String({ description: "Exact current working directory match." })),
  sessionId: Type.Optional(Type.String({ description: "Exact session ID match." })),
  instanceId: Type.Optional(Type.String({ description: "Exact live activation ID match." })),
  detail: Type.Optional(StringEnum(["compact", "full"] as const)),
});

type Item =
  | { kind: "running"; session: ReturnType<typeof liveOverview>["sessions"][number] }
  | { kind: "recent"; session: HistorySnapshot["sessions"][number] };

function compactItem(item: Item, now: number) {
  if (item.kind === "recent")
    return {
      kind: item.kind,
      session: {
        sessionId: item.session.sessionId,
        cwd: item.session.cwd,
        name: item.session.name,
        lastSavedAge: relativeTime(item.session.modifiedAt, now),
      },
    };
  return {
    kind: item.kind,
    session: {
      instanceId: item.session.instanceId,
      processIdentity: item.session.processIdentity ?? null,
      pid: item.session.pid,
      cwd: item.session.cwd,
      sessionId: item.session.sessionId,
      name: item.session.name,
      provider: item.session.provider ?? null,
      model: item.session.model,
      thinking: item.session.thinking,
      activity: item.session.activity,
      evidence: item.session.evidence,
      freshness: item.session.freshness,
      activeTools: item.session.activeTools,
      lastChangeAge: observedChangeAge(item.session.activityAt, now),
    },
  };
}

function compactGroupReference(item: Item) {
  return {
    kind: item.kind,
    ...(item.kind === "running"
      ? {
          instanceId: item.session.instanceId,
          sessionId: item.session.sessionId,
          pid: item.session.pid,
        }
      : { sessionId: item.session.sessionId }),
  };
}

/** Agent-facing metadata inventory. It deliberately does not use history for the default scope. */
export function registerListPiSessionsTool(pi: ExtensionAPI, deps: ListPiSessionsDeps = {}): void {
  const getOverview = deps.overview ?? liveOverview;
  const getHistory = deps.history ?? readHistory;
  pi.registerTool({
    name: "list_pi_sessions",
    label: "List Pi Sessions",
    description:
      "List Pi session metadata for repo auditing. Default scope is running; use recent or both for saved metadata. Optional cwd, sessionId, and instanceId filters are exact matches applied before pagination and grouping. Compact output is the default; use detail=full for session-file paths and the complete legacy row shape. Saved sessions are not evidence of stopped or idle state; discovery is best effort.",
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
      const all: Item[] = [
        ...(scope !== "recent"
          ? live.sessions.map((session) => ({ kind: "running" as const, session }))
          : []),
        ...(scope !== "running"
          ? recent.map((session) => ({ kind: "recent" as const, session }))
          : []),
      ];
      const filtered = all.filter(
        (item) =>
          (params.cwd === undefined || item.session.cwd === params.cwd) &&
          (params.sessionId === undefined || item.session.sessionId === params.sessionId) &&
          (params.instanceId === undefined ||
            (item.kind === "running" && item.session.instanceId === params.instanceId)),
      );
      const offset = params.offset ?? 0;
      const limit = params.limit ?? 100;
      const page = filtered.slice(offset, offset + limit);
      const now = (deps.now ?? Date.now)();
      const detail = params.detail ?? "compact";
      const sessions = detail === "full" ? page : page.map((item) => compactItem(item, now));
      const groups = params.groupByCwd
        ? [...new Set(page.map((x) => x.session.cwd))].map((cwd) => ({
            cwd,
            sessions:
              detail === "full"
                ? page.filter((x) => x.session.cwd === cwd)
                : page.filter((x) => x.session.cwd === cwd).map(compactGroupReference),
          }))
        : undefined;
      const warnings = [
        ...new Set([
          ...live.warnings,
          ...sharedProcessWarnings(live.sessions),
          ...(recentSnapshot?.warnings ?? []),
        ]),
      ];
      const result = {
        schemaVersion: 1,
        generatedAt: new Date(now).toISOString(),
        scope,
        detail,
        sessions,
        ...(groups ? { groups } : {}),
        counts: { total: filtered.length, offset, returned: page.length },
        nextOffset: offset + page.length < filtered.length ? offset + page.length : null,
        historyDirectories: [...historyDirectories],
        projectDirectories: [...new Set(page.map((item) => item.session.cwd))],
        coverage: {
          complete: false,
          limitations: [
            "Linux-only best-effort process discovery",
            "saved metadata does not identify live or stopped sessions",
            "unconnected custom session directories are unavailable",
            "cwd values are not git roots",
            "filters are exact and applied before pagination; grouping covers only this page",
            "each call performs a fresh scan",
          ],
        },
        warnings,
      };
      return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
    },
  });
}
