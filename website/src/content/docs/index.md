---
title: pi-session-info
description: Local live-status views for running Pi sessions on Linux.
---

`pi-session-info` provides a read-only `/sessions` view and Bun CLI for local
Pi status. Instrumented sessions publish private metadata; uninstrumented
processes use a deliberately limited fallback.

## Quick start

```sh
bun install
pi -e ./src/extension/index.ts
```

Run `/sessions` in Pi. The project-first list has selectable rows, details,
**Refresh**, and **Close**. It is a snapshot, not a watch view. Existing Pi
processes must each load the extension; use `/reload` in an already configured
instance. Nothing is installed automatically.

The CLI is available with `bun run start` or `bun run start --json`. Demo data
is always synthetic and never live discovery.

## Current scope

- Linux process identity matches PID, boot identity, and start ticks exactly.
- The publisher observes the parent lifecycle, concurrent tool names/IDs,
  explicit UI waiting, model, thinking level, and session name.
- Heartbeats run every 5 seconds; reports older than 20 seconds or from the
  future are **Stale**. Stale reports retain last observed activity; they do
  not imply idle or death.
- There is no background-agent tracking, history, watch mode, macOS support, or
  automatic installation.

See [CLI reference](./cli/), [Pi extension](./extension/), and
[Discovery & privacy](./discovery/).
