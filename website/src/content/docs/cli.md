---
title: CLI reference
description: Supported flags and live-status output.
---

```sh
bun run start [--demo] [--json] [--registry-dir PATH]
bun run start --help
```

| Flag | Behavior |
| --- | --- |
| `--help`, `-h` | Print usage without discovery. |
| `--demo` | Use fictional synthetic rows; never performs live discovery. |
| `--json` | Print the overview as formatted JSON. |
| `--registry-dir PATH` | Read the private registry from `PATH`. |

Unknown options and positional arguments are rejected. History, watch mode,
the CLI `show` command, and `--session-dir` are not available. The `/sessions`
picker does offer metadata-only details.

## Output

Text uses compact cards. Uninstrumented processes are labeled **Not connected**;
missing values remain unknown rather than being filled with diagnostics.

JSON preserves unknown values and provenance. The snapshot includes `generatedAt`
and may include report/activity timestamps, `mode`, `provider`, `sessionFile`,
and `processIdentity`. Connected rows can expose session name, model, thinking,
activity, and concurrent tool names. Call IDs remain in registry records, not
the overview JSON. A report older than 20 seconds or in
the future is `stale`, retaining its last activity.

`PI_SESSION_INFO_REGISTRY_DIR` takes precedence over the valid
`XDG_RUNTIME_DIR` location, with `~/.cache/pi-session-info/run` as fallback.
The reader does not delete stale records. Linux identity matching uses boot
identity and process start ticks, not PID alone.

## Exit codes

| Code | Behavior |
| --- | --- |
| `0` | Help or a successful, possibly partial snapshot. |
| `2` | Invalid arguments or discovery failure. |
