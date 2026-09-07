---
title: Pi extension
description: Load the extension and use the /sessions command.
---

## Load from a checkout

```sh
pi -e ./src/extension/index.ts
```

Then run `/sessions`. It shows project-first selectable rows with read-only
details, **Refresh**, and **Close**. The list is a snapshot, not a watch view,
and does not control sessions or add output to model context.

Every existing Pi process must load the extension to publish live status. If it
already loads this checkout, run `/reload` there; reloading only the viewer does
not instrument other processes. Nothing changes Pi configuration automatically.

To register this checkout persistently, explicitly run:

```sh
pi install /absolute/path/to/pi-session-info
```

Replace the placeholder with your checkout path, then `/reload` or restart each
Pi instance that should report status. The command takes no arguments and returns
without showing an inventory when no UI is available.

## Observed status

The publisher writes private atomic metadata for the parent Pi lifecycle,
including concurrent tool names and IDs, explicit UI waiting, model, thinking
level, and session name. It sends a 5-second heartbeat. Reports older than 20
seconds, or with future timestamps, are **Stale** and retain their last
observed activity.

It does not track independent background agents, read history, provide watch
mode, support macOS, or install itself automatically. The extension uses
Node-compatible APIs and is typechecked against Pi 0.85.1; other host versions
are unverified.
