import { parseArgs } from "node:util";
import { demoOverview } from "./demo";
import { formatOverview } from "./format";
import { liveOverview } from "./inventory";
import { readProcessIdentity } from "./process/identity";
import type { Overview } from "./core/types";

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface CliDeps {
  overview?: () => Overview;
  now?: () => number;
  processIdentity?: string | null;
}

export function runCli(args: string[], deps: CliDeps = {}): CommandResult {
  try {
    const { values } = parseArgs({
      args,
      strict: true,
      allowPositionals: false,
      options: {
        help: { type: "boolean", short: "h" },
        demo: { type: "boolean" },
        json: { type: "boolean" },
        "registry-dir": { type: "string" },
      },
    });
    if (values.help) {
      return {
        code: 0,
        stdout:
          "Usage: bun run start [--demo] [--json] [--registry-dir PATH]\n\nLinux process discovery with extension-published live status. Text output marks the matching process as 'this process'. --demo uses synthetic data.",
        stderr: "",
      };
    }
    const now = deps.now ?? Date.now;
    const snapshotNow = now();
    const overview = deps.overview
      ? deps.overview()
      : values.demo
        ? demoOverview()
        : liveOverview(
            values["registry-dir"] === undefined
              ? { now: () => snapshotNow }
              : { registryDir: values["registry-dir"], now: () => snapshotNow },
          );
    const currentProcessIdentity =
      deps.processIdentity === undefined ? readProcessIdentity(process.pid) : deps.processIdentity;
    return {
      code: 0,
      stdout: values.json
        ? JSON.stringify(overview, null, 2)
        : formatOverview(overview, { currentProcessIdentity, now: snapshotNow }),
      stderr: "",
    };
  } catch (error) {
    return {
      code: 2,
      stdout: "",
      stderr: error instanceof Error ? error.message : "Invalid arguments.",
    };
  }
}

if (import.meta.main) {
  const result = runCli(process.argv.slice(2));
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  process.exitCode = result.code;
}
