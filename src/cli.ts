import { parseArgs } from "node:util";
import { demoOverview } from "./demo";
import { formatOverview } from "./format";
import { liveOverview } from "./inventory";

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function runCli(args: string[]): CommandResult {
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
        stdout: "Usage: bun run start [--demo] [--json] [--registry-dir PATH]\n\nLinux process discovery with extension-published live status. --demo uses synthetic data.",
        stderr: "",
      };
    }
    const overview = values.demo ? demoOverview() : liveOverview(values["registry-dir"] === undefined ? {} : { registryDir: values["registry-dir"] });
    return {
      code: 0,
      stdout: values.json ? JSON.stringify(overview, null, 2) : formatOverview(overview),
      stderr: "",
    };
  } catch (error) {
    return { code: 2, stdout: "", stderr: error instanceof Error ? error.message : "Invalid arguments." };
  }
}

if (import.meta.main) {
  const result = runCli(process.argv.slice(2));
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  process.exitCode = result.code;
}
