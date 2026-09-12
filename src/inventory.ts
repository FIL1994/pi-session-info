import type { Overview, SessionRow } from "./core/types";
import type { RegistryRecord } from "./core/registry-schema";
import { discoverSessions } from "./discover";
import { readProcessIdentity } from "./process/identity";
import { readRecords, resolveRegistryDir } from "./registry/store";

/**
 * A PID can contain more than one extension activation. Keep this warning
 * about the complete live inventory so callers can safely page or filter it.
 */
export function sharedProcessWarnings(sessions: readonly SessionRow[]): string[] {
  const byPid = new Map<number, SessionRow[]>();
  for (const session of sessions) {
    const rows = byPid.get(session.pid) ?? [];
    rows.push(session);
    byPid.set(session.pid, rows);
  }
  const warnings: string[] = [];
  for (const [pid, rows] of byPid) {
    if (rows.length < 2) continue;
    const identities = [
      ...new Set(rows.flatMap((row) => (row.processIdentity ? [row.processIdentity] : []))),
    ];
    const identity = identities.length ? ` (process identity: ${identities.join(", ")})` : "";
    warnings.push(
      `PID ${pid}${identity} has ${rows.length} active Pi activations; killing this PID affects all of them.`,
    );
  }
  return warnings;
}

/** Exact birth-identity matches only. Neither cwd nor saved history identifies a live session. */
export function reconcile(
  fallback: Overview,
  records: RegistryRecord[],
  identity: (pid: number) => string | null,
  now: number,
): Overview {
  const warnings = [...fallback.warnings];
  const identities = new Map<number, string | null>();
  const live = records.filter((record) => {
    if (!identities.has(record.pid)) identities.set(record.pid, identity(record.pid));
    return identities.get(record.pid) === record.processIdentity;
  });
  // Multiple live activations can be legitimate in-process sessions. Keep them distinct.
  const instrumented = new Set(live.map((record) => record.pid));
  const sessions: SessionRow[] = fallback.sessions.filter((row) => !instrumented.has(row.pid));
  for (const record of live) {
    const age = now - Date.parse(record.heartbeatAt);
    sessions.push({
      instanceId: record.instanceId,
      pid: record.pid,
      processIdentity: record.processIdentity,
      cwd: record.cwd,
      sessionId: record.sessionId,
      sessionFile: record.sessionFile,
      parentSessionFile: record.parentSessionFile ?? null,
      name: record.sessionName,
      model: record.model,
      provider: record.provider,
      mode: record.mode,
      thinking: record.thinking,
      activity: record.activity,
      evidence: "extension",
      freshness: age >= 0 && age <= 20_000 ? "fresh" : "stale",
      heartbeatAt: record.heartbeatAt,
      activityAt: record.activityAt,
      activeTools: record.activeTools.map((tool) => tool.name),
    });
  }
  sessions.sort(
    (a, b) =>
      a.cwd.localeCompare(b.cwd) || a.pid - b.pid || a.instanceId.localeCompare(b.instanceId),
  );
  warnings.push(...sharedProcessWarnings(sessions));
  return {
    ...fallback,
    sessions,
    warnings: [...new Set(warnings)],
    generatedAt: new Date(now).toISOString(),
  };
}

export function liveOverview(
  options: {
    registryDir?: string;
    discover?: () => Overview;
    identity?: (pid: number) => string | null;
    now?: () => number;
  } = {},
): Overview {
  const fallback = (options.discover ?? discoverSessions)();
  const registry = readRecords(options.registryDir ?? resolveRegistryDir());
  const overview = reconcile(
    fallback,
    registry.records,
    options.identity ?? readProcessIdentity,
    (options.now ?? Date.now)(),
  );
  overview.warnings.push(...registry.warnings);
  return overview;
}
