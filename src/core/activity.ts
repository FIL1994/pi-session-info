/** Pure activity state used by the lifecycle adapter. */
import type { Activity } from "./types";

export interface ActivityState {
  activity: Activity;
  tools: Map<string, string>;
  promptDepth: number;
  agentRunning: boolean;
  hostIdle: boolean | null;
}

export function createActivityState(): ActivityState {
  return {
    activity: "unknown",
    tools: new Map(),
    promptDepth: 0,
    agentRunning: false,
    hostIdle: null,
  };
}

export function deriveActivity(s: ActivityState): Activity {
  if (s.promptDepth > 0) return "waiting-user";
  if (s.tools.size > 0) return "tool";
  if (s.agentRunning) return "working";
  if (s.hostIdle === true) return "idle";
  if (s.hostIdle === false) return "working";
  return "unknown";
}

export function reduceActivity(
  s: ActivityState,
  event: string,
  data: { id?: string; name?: string; idle?: boolean } = {},
): ActivityState {
  const n = { ...s, tools: new Map(s.tools) };
  switch (event) {
    case "agent_start":
      n.agentRunning = true;
      break;
    case "agent_end":
      break;
    case "agent_settled":
      n.agentRunning = false;
      n.hostIdle = data.idle ?? true;
      break;
    case "tool_execution_start":
      if (data.id) n.tools.set(data.id, data.name ?? "unknown");
      break;
    case "tool_execution_end":
      if (data.id) n.tools.delete(data.id);
      break;
    case "ui_prompt_start":
      n.promptDepth++;
      break;
    case "ui_prompt_end":
      n.promptDepth = Math.max(0, n.promptDepth - 1);
      break;
    case "session_before_compact":
      n.agentRunning = true;
      break;
    case "session_compact":
    case "session_compact_failed":
      n.agentRunning = true;
      break;
  }
  n.activity = deriveActivity(n);
  return n;
}
