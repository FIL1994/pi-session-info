/** Presentation contract, not yet a persisted registry wire format. */
export type Activity = "working" | "tool" | "waiting-user" | "idle" | "unknown";
export type Evidence = "extension" | "inferred" | "unmatched";
export type Freshness = "fresh" | "stale" | "unknown";

export interface SessionRow {
  instanceId: string;
  pid: number;
  cwd: string;
  sessionId: string | null;
  name: string | null;
  model: string | null;
  thinking: string | null;
  activity: Activity;
  evidence: Evidence;
  freshness: Freshness;
  activeTools: string[];
}

export interface Overview {
  schemaVersion: 1;
  source: "demo" | "live";
  sessions: SessionRow[];
  warnings: string[];
}
