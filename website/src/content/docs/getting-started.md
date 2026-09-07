---
title: Getting started
description: Set up live status from a local checkout.
---

## Requirements

- Bun 1.3 or newer.
- Linux with readable `/proc` for live discovery.
- Pi for `/sessions` (typechecked against Pi 0.85.1).

## Load the extension

```sh
bun install
pi -e ./src/extension/index.ts
```

Run `/sessions`. Existing Pi processes must each load the extension; run
`/reload` in instances that already load it. No automatic installation occurs.

## Run the CLI

```sh
bun run start
bun run start --json
bun run start --registry-dir /path/to/registry
```

The CLI combines verified registry records with limited Linux fallback. Connected
status reports parent lifecycle activity, model, thinking, name, and concurrent
tools. Reports older than 20 seconds or dated in the future are stale.

## Demo

```sh
bun run demo
bun run start --demo --json
```

Demo output is always synthetic and does not represent live discovery.

## Limitations

There is no background-agent tracking, history, watch mode, macOS support, or
automatic installation. Fallback recognizes only the exact `pi` title and labels
those rows **Not connected**. See [Discovery & privacy](../discovery/).
