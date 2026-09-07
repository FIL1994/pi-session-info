import { parseArgs } from "node:util";
import { demoOverview } from "./demo";
import { formatOverview } from "./format";

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
      },
    });
    if (values.help) {
      return {
        code: 0,
        stdout: "Usage: bun run start --demo [--json]\n\nScaffold only. --demo uses synthetic data.\nLive discovery, watch mode, and the Pi extension are planned.",
        stderr: "",
      };
    }
    if (!values.demo) {
      return { code: 2, stdout: "", stderr: "Live discovery is not implemented. Use --demo or --help." };
    }
    const overview = demoOverview();
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
