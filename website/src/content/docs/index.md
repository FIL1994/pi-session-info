---
title: pi-session-info
description: Pi extension and CLI for listing running Pi processes on Linux.
---

`pi-session-info` adds a `/sessions` command to Pi that lists running Pi
processes on Linux. It shows process IDs and working directories in a read-only
list. The same inventory is available through a Bun CLI.

## Load the extension

From the repository root:

```sh
bun install
pi -e ./src/extension/index.ts
```

In Pi, run:

```text
/sessions
```

Select **Close** to dismiss the list. The command takes no arguments and does
not add its output to model context.

For persistent installation and compatibility details, see
[Pi extension](./extension/).

## Run the CLI

```sh
bun run start
bun run start --json
```

The CLI requires Bun 1.3 or newer. See [CLI reference](./cli/) for flags,
output fields, and exit codes.

## Current limitations

- Linux only; discovery requires readable `/proc`.
- Matches current-user processes with the exact `pi` title. Node launchers and
  in-process subagents may be omitted.
- Session ID, model, thinking level, activity, and active tools are not observed.
- No transcript reads, lifecycle telemetry, or watch mode.

Loading the extension does not enable additional telemetry. Both interfaces use
the same process discovery code. See [Discovery & privacy](./discovery/) for
matching rules and [Development & roadmap](./development/) for planned work.
