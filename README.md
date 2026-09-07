# pi-session-info

A local CLI for seeing which Pi sessions are running, what they are doing,
and how confidently that information is known.

**Status: scaffold, not a working session monitor.** The CLI currently renders
synthetic examples only. It does not read processes or transcripts, install an
extension, write status records, or contact any service.

## Stack

TypeScript + Bun for the CLI, tests, and development workflow. The planned Pi
extension will use Node-compatible TypeScript and share small contracts with
the CLI. No daemon, database, web server, or runtime dependencies in the scaffold.

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

Without `--demo`, the scaffold exits with an explicit not-implemented error.
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
