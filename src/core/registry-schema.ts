import type { Activity } from "./types";

export interface RegistryRecord {
  schemaVersion: 1; instanceId: string; sequence: number; pid: number; processIdentity: string;
  startedAt: string; heartbeatAt: string; activityAt: string; sessionId: string | null;
  sessionFile: string | null; leafId: string | null; cwd: string; sessionName: string | null;
  mode: string | null; provider: string | null; model: string | null; thinking: string | null;
  activity: Activity; activeTools: Array<{ id: string; name: string }>; capabilities: string[];
}

const keys = new Set(["schemaVersion","instanceId","sequence","pid","processIdentity","startedAt","heartbeatAt","activityAt","sessionId","sessionFile","leafId","cwd","sessionName","mode","provider","model","thinking","activity","activeTools","capabilities"]);
const activities = new Set<Activity>(["working", "tool", "waiting-user", "idle", "unknown"]);
const str = (x: unknown): x is string => typeof x === "string" && x.length > 0 && x.length <= 4096;
const nullable = (x: unknown): x is string | null => x === null || str(x);
function tool(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const fields = value as Record<string, unknown>;
  return Object.keys(fields).length === 2 && str(fields.id) && str(fields.name);
}

export function validateRecord(value: unknown): value is RegistryRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => !keys.has(k)) || Object.keys(v).length !== keys.size) return false;
  if (v.schemaVersion !== 1 || typeof v.instanceId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.instanceId)) return false;
  if (!Number.isSafeInteger(v.sequence) || (v.sequence as number) < 0 || !Number.isSafeInteger(v.pid) || (v.pid as number) <= 0 || !str(v.processIdentity) || !str(v.cwd)) return false;
  for (const k of ["startedAt", "heartbeatAt", "activityAt"]) {
    const value = v[k];
    if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) return false;
  }
  for (const k of ["sessionId","sessionFile","leafId","sessionName","mode","provider","model","thinking"]) if (!nullable(v[k])) return false;
  if (v.mode !== null && !["tui", "rpc", "json", "print"].includes(v.mode as string)) return false;
  if (typeof v.activity !== "string" || !activities.has(v.activity as Activity) || !Array.isArray(v.capabilities) || v.capabilities.length > 100 || !v.capabilities.every(str)) return false;
  if (!Array.isArray(v.activeTools) || v.activeTools.length > 100 || !v.activeTools.every(tool)) return false;
  return true;
}
