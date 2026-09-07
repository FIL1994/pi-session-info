import type { Overview } from "./core/types";

/** Synthetic examples only; never read a real session or process. */
export function demoOverview(): Overview {
  return {
    schemaVersion: 1,
    source: "demo",
    warnings: ["Synthetic demo data; live discovery is not implemented."],
    sessions: [
      {
        instanceId: "demo-composer",
        pid: 4101,
        cwd: "/example/projects/composer",
        sessionId: "demo-session-1",
        name: "Build playback controls",
        model: "example-provider/example-model",
        thinking: "high",
        activity: "tool",
        evidence: "extension",
        freshness: "fresh",
        activeTools: ["apply_patch", "exec_command"],
      },
      {
        instanceId: "demo-review",
        pid: 4102,
        cwd: "/example/projects/review-app",
        sessionId: "demo-session-2",
        name: "Review workspace",
        model: "example-provider/example-model",
        thinking: "low",
        activity: "idle",
        evidence: "extension",
        freshness: "fresh",
        activeTools: [],
      },
      {
        instanceId: "demo-unmatched",
        pid: 4103,
        cwd: "/example/projects/composer",
        sessionId: null,
        name: null,
        model: null,
        thinking: null,
        activity: "unknown",
        evidence: "unmatched",
        freshness: "unknown",
        activeTools: [],
      },
    ],
  };
}
