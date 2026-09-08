import type { RegistryRecord } from "../core/registry-schema";
import { removeRecord, resolveRegistryDir, writeRecord } from "../registry/store";

export interface PublisherOptions {
  clock?: () => number;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
  heartbeatMs?: number;
  coalesceMs?: number;
  dir?: string;
  warn?: (message: string) => void;
  write?: (dir: string, record: RegistryRecord) => void;
  remove?: (dir: string, id: string) => void;
  sample?: () => RegistryRecord;
}

/** Small synchronous atomic writes cannot outlive close(); event bursts are coalesced. */
export function createPublisher(initial: RegistryRecord, options: PublisherOptions = {}) {
  const clock = options.clock ?? Date.now;
  const later = options.setTimeout ?? globalThis.setTimeout;
  const cancel = options.clearTimeout ?? globalThis.clearTimeout;
  const dir = options.dir ?? resolveRegistryDir();
  const store = options.write ?? writeRecord;
  const erase = options.remove ?? removeRecord;
  let record = initial;
  let sequence = initial.sequence;
  let pending: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let warned = false;
  const report = () => {
    if (warned) return;
    warned = true;
    try {
      options.warn?.("Session status unavailable: check registry permissions and metadata limits.");
    } catch {
      /* observational only */
    }
  };
  const write = () => {
    pending = undefined;
    if (closed) return;
    try {
      const next = {
        ...record,
        sequence: sequence + 1,
        heartbeatAt: new Date(clock()).toISOString(),
      };
      store(dir, next);
      record = next;
      sequence = next.sequence;
    } catch {
      report();
    }
  };
  const timer = (callback: () => void, ms: number) => {
    const handle = later(callback, ms);
    handle.unref?.();
    return handle;
  };
  const beat = () => {
    if (closed) return;
    try {
      record = options.sample?.() ?? record;
    } catch {
      report();
      if (!closed) heartbeat = timer(beat, options.heartbeatMs ?? 5_000);
      return;
    }
    if (pending !== undefined) {
      cancel(pending);
      pending = undefined;
    }
    write();
    if (!closed) heartbeat = timer(beat, options.heartbeatMs ?? 5_000);
  };
  write();
  heartbeat = timer(beat, options.heartbeatMs ?? 5_000);
  return {
    update(next: RegistryRecord) {
      if (closed) return;
      record = next;
      if (pending === undefined) pending = timer(write, options.coalesceMs ?? 250);
    },
    close() {
      if (closed) return;
      closed = true;
      if (pending !== undefined) cancel(pending);
      if (heartbeat !== undefined) cancel(heartbeat);
      try {
        erase(dir, record.instanceId);
      } catch {
        report();
      }
    },
    get record() {
      return record;
    },
  };
}
