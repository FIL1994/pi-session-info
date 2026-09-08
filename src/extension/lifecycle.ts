import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { createActivityState, deriveActivity, reduceActivity } from "../core/activity";
import type { RegistryRecord } from "../core/registry-schema";
import { createPublisher, type PublisherOptions } from "./publisher";
import { readProcessIdentity } from "../process/identity";

export interface LifecycleDeps extends PublisherOptions {
  pid?: number;
  processRoot?: string;
  identity?: (pid: number, root: string) => string | null;
  uuid?: () => string;
}

export function registerLifecycle(pi: ExtensionAPI, deps: LifecycleDeps = {}): void {
  let publisher: ReturnType<typeof createPublisher> | undefined;
  let state = createActivityState();
  let warned = false;
  let generation = 0;
  const clock = deps.clock ?? Date.now;
  const warn = (ctx: ExtensionContext) => {
    if (warned) return;
    warned = true;
    const message =
      "Session status unavailable: check Linux process access, registry permissions, and metadata limits.";
    try {
      if (deps.warn) deps.warn(message);
      else if (ctx.hasUI) ctx.ui.notify(message, "warning");
    } catch {
      /* never affect the host */
    }
  };
  const metadata = (ctx: ExtensionContext) => ({
    sessionId: ctx.sessionManager.getSessionId() ?? null,
    sessionFile: ctx.sessionManager.getSessionFile() ?? null,
    parentSessionFile:
      typeof ctx.sessionManager.getHeader === "function"
        ? (ctx.sessionManager.getHeader()?.parentSession ?? null)
        : null,
    leafId: ctx.sessionManager.getLeafId() ?? null,
    cwd: ctx.sessionManager.getCwd(),
    sessionName: ctx.sessionManager.getSessionName() ?? null,
    mode: ctx.mode,
    provider: ctx.model?.provider ?? null,
    model: ctx.model?.id ?? null,
    thinking: ctx.thinkingLevel ?? null,
    activity: state.activity,
    activeTools: [...state.tools].map(([id, name]) => ({ id, name })),
  });
  const hostSample = (ctx: ExtensionContext) => {
    state.hostIdle = ctx.isIdle();
    if (state.hostIdle) state.tools.clear();
    state.agentRunning = !state.hostIdle;
    state.activity = deriveActivity(state);
  };
  const snapshot = (ctx: ExtensionContext): RegistryRecord => {
    const old = publisher!.record;
    const next = { ...old, ...metadata(ctx) };
    if (JSON.stringify(next) !== JSON.stringify(old))
      next.activityAt = new Date(clock()).toISOString();
    return next;
  };
  const refresh = (ctx: ExtensionContext, sample = false) => {
    if (!publisher) return;
    try {
      if (sample) hostSample(ctx);
      const next = snapshot(ctx);
      if (JSON.stringify(next) !== JSON.stringify(publisher.record)) publisher.update(next);
    } catch {
      warn(ctx);
    }
  };
  const observe = (
    ctx: ExtensionContext,
    event: string,
    data: { id?: string; name?: string } = {},
  ) => {
    if (!publisher) return;
    try {
      state = reduceActivity(state, event, { ...data, idle: ctx.isIdle() });
      refresh(ctx);
    } catch {
      warn(ctx);
    }
  };
  const close = () => {
    generation++;
    publisher?.close();
    publisher = undefined;
    state = createActivityState();
  };
  pi.on("session_start", (_event, ctx) => {
    close();
    warned = false;
    const activation = generation;
    try {
      const pid = deps.pid ?? process.pid;
      const identity = (deps.identity ?? readProcessIdentity)(pid, deps.processRoot ?? "/proc");
      if (!identity) {
        warn(ctx);
        return;
      }
      hostSample(ctx);
      const now = new Date(clock()).toISOString();
      const initial: RegistryRecord = {
        schemaVersion: 1,
        instanceId: (deps.uuid ?? randomUUID)(),
        sequence: 0,
        pid,
        processIdentity: identity,
        startedAt: now,
        heartbeatAt: now,
        activityAt: now,
        ...metadata(ctx),
        capabilities: [
          "parent-lifecycle",
          "host-idle",
          "parallel-tools",
          "ui-prompt",
          "model",
          "heartbeat",
        ],
      };
      publisher = createPublisher(initial, {
        ...deps,
        warn: () => warn(ctx),
        sample: () => {
          if (activation !== generation || !publisher) throw new Error("closed activation");
          hostSample(ctx);
          return snapshot(ctx);
        },
      });
    } catch {
      warn(ctx);
    }
  });
  pi.on("agent_start", (_e, ctx) => observe(ctx, "agent_start"));
  pi.on("agent_end", (_e, ctx) => observe(ctx, "agent_end"));
  pi.on("agent_settled", (_e, ctx) => {
    if (!publisher) return;
    if (ctx.isIdle()) state.tools.clear();
    refresh(ctx, true);
  });
  pi.on("tool_execution_start", (e, ctx) =>
    observe(ctx, "tool_execution_start", { id: e.toolCallId, name: e.toolName }),
  );
  pi.on("tool_execution_end", (e, ctx) => observe(ctx, "tool_execution_end", { id: e.toolCallId }));
  pi.on("ui_prompt_start", (_e, ctx) => observe(ctx, "ui_prompt_start"));
  pi.on("ui_prompt_end", (_e, ctx) => {
    observe(ctx, "ui_prompt_end");
    refresh(ctx, true);
  });
  pi.on("session_before_compact", (_e, ctx) => observe(ctx, "session_before_compact"));
  pi.on("session_compact", (_e, ctx) => refresh(ctx, true));
  pi.on("session_compact_failed", (_e, ctx) => refresh(ctx, true));
  pi.on("session_info_changed", (_e, ctx) => refresh(ctx));
  pi.on("model_select", (_e, ctx) => refresh(ctx));
  pi.on("thinking_level_select", (_e, ctx) => refresh(ctx));
  pi.on("session_tree", (_e, ctx) => refresh(ctx));
  pi.on("session_shutdown", close);
}
