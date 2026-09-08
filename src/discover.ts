import { readdirSync, readFileSync, readlinkSync, statSync } from "node:fs";
import type { Overview } from "./core/types";

/** General limitation, not an error encountered by an individual scan. */
export const PROCESS_DISCOVERY_LIMITATION = "Process-only discovery recognizes exact 'pi' titles; unconnected Node launchers and in-process agents may be omitted.";

/** Conservative Linux fallback: only exact Pi process titles, never argv/env. */
export function discoverSessions(procRoot = "/proc", platform = process.platform): Overview {
  if (platform !== "linux") throw new Error("Process discovery currently supports Linux only.");
  const overview: Overview = {
    schemaVersion: 1,
    source: "live",
    sessions: [],
    warnings: [PROCESS_DISCOVERY_LIMITATION],
  };
  let denied = 0;
  for (const pid of readdirSync(procRoot).filter((entry) => /^\d+$/.test(entry))) {
    const base = `${procRoot}/${pid}`;
    try {
      if (statSync(base).uid !== process.getuid?.()) continue;
      if (readFileSync(`${base}/comm`, "utf8").trim() !== "pi") continue;
      const before = readFileSync(`${base}/stat`, "utf8");
      const fields = before.slice(before.lastIndexOf(")") + 2).split(" ");
      if (fields[0] === "Z" || fields[0] === "X") continue;
      const cwd = readlinkSync(`${base}/cwd`);
      const after = readFileSync(`${base}/stat`, "utf8");
      const birth = fields[19];
      if (!birth || after.slice(after.lastIndexOf(")") + 2).split(" ")[19] !== birth) continue;
      overview.sessions.push({
        instanceId: `process-${pid}-${birth}`, pid: Number(pid), cwd,
        sessionId: null, name: null, model: null, thinking: null,
        activity: "unknown", evidence: "unmatched", freshness: "unknown", activeTools: [],
      });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ESRCH") denied++;
    }
  }
  overview.sessions.sort((a, b) => a.pid - b.pid);
  if (denied) overview.warnings.push(`${denied} process entries could not be inspected.`);
  return overview;
}
