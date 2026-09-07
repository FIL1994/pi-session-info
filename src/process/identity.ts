import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export function readProcessIdentity(pid: number, procRoot = "/proc"): string | null {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    const dir = join(procRoot, String(pid));
    const st = statSync(dir); const uid = typeof process.getuid === "function" ? process.getuid() : st.uid;
    if (st.uid !== uid) return null;
    const raw = readFileSync(join(dir, "stat"), "utf8");
    const close = raw.lastIndexOf(")"); if (close < 0) return null;
    const fields = raw.slice(close + 1).trim().split(/\s+/);
    if (!["R", "S", "D", "T", "t", "W", "I"].includes(fields[0] ?? "") || !/^\d+$/.test(fields[19] ?? "")) return null;
    const boot = readFileSync(join(procRoot, "sys/kernel/random/boot_id"), "utf8").trim();
    if (!boot) return null;
    return `${boot}:${fields[19]}`;
  } catch { return null; }
}
