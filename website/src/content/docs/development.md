---
title: Development & roadmap
description: Checks, website commands, and current implementation slice.
---

## Checks

From the repository root:

```sh
bun install
bun run check
```

Use synthetic fixtures and injected clocks/process providers. Extension and
shared code must run in Pi's Node runtime. Website commands are run separately:

```sh
cd website
bun install
bun run check
bun run build
```

## Current implementation slice

The live-status slice includes a private `0700`/`0600` atomic metadata registry,
validated path precedence, Linux boot-plus-start PID identity matching, lifecycle
publishing, concurrent tool tracking, UI waiting, and model/thinking/name
metadata. Heartbeats are 5 seconds; 20-second and future reports are stale.

`/sessions` is project-first, selectable, read-only, and offers details,
**Refresh**, and **Close**. Running/Recent tabs separate live inventory from
saved metadata; Recent starts at 15 and offers Show more. CLI cards and JSON preserve unknowns and provenance.
JSON includes `generatedAt` and may include activity/report timestamps, mode,
provider, session file, and process identity.

This is a milestone slice, not completion of every M1–M3 gate. It intentionally
does not include background-agent tracking, branch-aware history content/usage, watch mode, macOS, or
automatic installation. Existing Pi processes must load or `/reload` the
extension. Demo data is always synthetic. Keep personal paths out of examples.

## Constraints

- Local, passive observation; no session control, prompts, tool payloads,
  credentials, environment dumps, network, or daemon.
- Never infer idle from an old transcript; preserve unknowns and provenance.
- Fallback discovery recognizes exact `pi` titles only and uses **Not connected**.
