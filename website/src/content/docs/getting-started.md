---
title: Getting started
description: Run the current CLI from a local checkout.
---

## Requirements

- Bun 1.3 or newer for the CLI and tests.
- Linux with readable `/proc` for live discovery.
- Pi if you want to use the optional `/sessions` command.

The package is private and not yet a published CLI. Run these commands from a
checkout of this repository; no global `pi-session-info` executable is provided.

## Install and run

```sh
bun install
bun run start
```

The overview contains PID, status, evidence, freshness, model, directory, and
tools columns. Current live rows have unknown activity and freshness, unmatched
evidence, and no known model or tools.

For machine-readable output:

```sh
bun run start --json
```

## Preview without discovery

```sh
bun run demo
bun run start --demo --json
```

`--demo` bypasses process discovery and returns synthetic data. Its `extension`
evidence and known activity values illustrate the presentation, not implemented
telemetry. The demo warning still says live discovery is unimplemented; this is
an outdated fixture message, not the behavior of the default CLI.

## Troubleshooting

### No sessions appear

An empty result means no inspectable matching processes were found, not that no
Pi conversations exist. Only the current user's exact `pi` process titles match.
Node launchers and in-process subagents may be omitted. Read the snapshot warnings.

### Discovery fails on macOS or Windows

Live discovery currently supports Linux only. Use `--demo` to preview the output;
it does not provide a fallback live inventory.

### Some process entries could not be inspected

Permissions or other inspection failures can produce a partial inventory with a
warning count. Processes that disappear during inspection are normally skipped.
Do not elevate privileges merely to interpret an empty inventory as complete.

### Everything says unknown

This is expected. The current extension is a viewer, not a telemetry publisher.
See [discovery and privacy](../discovery/) for what can and cannot be observed.
