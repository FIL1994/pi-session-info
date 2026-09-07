import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { discoverSessions } from "../discover";
import { formatOverview } from "../format";

export default function sessionInfo(pi: ExtensionAPI) {
  pi.registerCommand("sessions", {
    description: "List running Pi processes (Linux; activity unknown without telemetry)",
    handler: async (args, ctx) => {
      if (args.trim()) {
        ctx.ui.notify("Usage: /sessions", "warning");
        return;
      }
      if (!ctx.hasUI) return;
      try {
        await ctx.ui.select(formatOverview(discoverSessions()), ["Close"]);
      } catch {
        ctx.ui.notify("Could not list sessions. Discovery requires readable Linux /proc.", "error");
      }
    },
  });
}
