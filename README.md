# pi-session-info

A local CLI for seeing which Pi sessions are running, what they are doing,
and how confidently that information is known.

**Status: early Linux process inventory.** The CLI and `/sessions` extension
command list current-user processes with the exact `pi` title. Models, session
identity, and activity remain unknown. No transcript reads, status publishing,
automatic installation, or network calls. Node launchers may be omitted.

## Pi extension

From this checkout, test in a new Pi session:

```sh
pi -e ./src/extension/index.ts
```

Then enter `/sessions`. It opens a read-only list; Close dismisses it. To register
the local package persistently, explicitly run `pi install /absolute/path/to/pi-session-info`
and reload/restart Pi. Nothing is installed automatically. The extension uses
Node APIs and is typechecked against Pi 0.85.1; other host versions are unverified.

## Stack

TypeScript + Bun for the CLI, tests, and development workflow. The planned Pi
extension uses Node-compatible TypeScript and shares discovery with the CLI.
No daemon, database, web server, or runtime dependencies; Pi is a dev type dependency.

This avoids maintaining a TypeScript extension alongside a second-language CLI.
Rust or Go would offer convenient native distribution, but that tradeoff is not
worth the extra protocol/toolchain work for this small local application yet.

## Development

Requires Bun 1.3 or newer.

```sh
bun install
bun run demo
bun run start --demo --json
bun run start --help
bun run check
```

Without `--demo`, the CLI reads Linux `/proc` and lists matching live processes.
Demo paths, IDs, models, and PIDs are fictional.

## Layout

```text
src/cli.ts          Argument parsing and entry point
src/core/types.ts   Initial presentation contracts
src/demo.ts         Synthetic example inventory
src/format.ts       Plain-text rendering and control-byte escaping
tests/              Bun tests
docs/               Detailed implementation plan
```

## Intended product

- Extension-backed identity and lifecycle status, with honest standalone fallback.
- Project, PID/terminal, session name, model, thinking, tools, and activity age.
- Optional saved-history details and explicitly scoped usage totals.
- Table, JSON, and watch output; Linux first, macOS next.
- Local-only and read-only observation; no session control or AI calls.

Start with **docs/implementation-plan.md**. It defines milestone order, acceptance
criteria, privacy boundaries, lifecycle handling, and compatibility research.
