---
title: Pi extension
description: Load the extension and use the /sessions command.
---

## Load from a checkout

```sh
pi -e ./src/extension/index.ts
```

Then run `/sessions`. It shows project-first selectable rows with read-only
details, **Refresh**, and **Close**. **Tab** or **←/→** switches between **Running**
and **Recent**; RPC clients get menu options. Recent shows the 15 newest saved
sessions, with **Show more** adding another 10. Exact running session IDs/files
are excluded before paging. Rows show project, saved name (or session ID), and
file modification time; no prompt or tool output excerpts are displayed.
History is cached until Refresh or closing the command. The list is a snapshot, not a watch view,
and does not control sessions or add output to model context.

Rows show relative saved ages; details retain exact dates. Use **Pin session** or
**Unpin session** in details to save favorites. **Pinned only** in Recent filters
before the 15-row limit, remains newest-first, and still excludes running sessions.
Pins are stored separately under `$XDG_STATE_HOME/pi-session-info/pins` (default
`~/.local/state/pi-session-info/pins`), not in transcripts. Missing or unscanned
sessions do not appear merely because they are pinned.

Search, Current Folder / All filtering, and resuming remain in native **`/resume`**.

## Dashboard navigation

Tabs, counts, snapshot age and actions stay visible while rows scroll. Wide
terminals show aligned project/name/status-or-age columns; narrow terminals
prioritize names. **c** opens scrollable coverage details instead of repeating
lengthy warnings in the main view.

Use **↑↓** / **Page Up / Down** to navigate, **Enter** for details, **r** to
refresh, **m** for more history, **p** for pinned-only Recent, and **Escape** to
close. Each tab preserves selection by session identity, including after refresh.

While loading, previous rows remain visible and **Escape** cancels. Failed or
cancelled refreshes retain the previous snapshot and show retry guidance. Ages
repaint periodically; discovery still requires Refresh. Process discovery is
synchronous; history scanning cooperatively cancels at I/O boundaries. RPC uses
equivalent action menus and a cancellable loading dialog.

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

Recent is saved metadata, not inferred idle activity. Unconnected processes may
not be mapped to files; a coverage note explains when saved history might still
include them. Use `/name` for recognizable titles and `/resume` to continue work.
Custom directories of other unconnected launchers cannot be discovered automatically.

It does not track independent background agents, provide watch
mode, support macOS, or install itself automatically. The extension uses
Node-compatible APIs and is typechecked against Pi 0.85.1; other host versions
are unverified.
