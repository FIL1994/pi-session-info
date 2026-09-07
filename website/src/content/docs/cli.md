---
title: CLI reference
description: Supported flags, output fields, and current exit behavior.
---

```sh
bun run start [--demo] [--json]
bun run start --help
```

| Flag | Behavior |
| --- | --- |
| `--help`, `-h` | Print usage without running discovery. |
| `--demo` | Return fictional sample rows instead of inspecting processes. |
| `--json` | Print the overview as formatted JSON instead of text. |

Flags can be combined. Positional arguments and unknown options are rejected.
`--watch`, `--cwd`, `--registry-dir`, `--session-dir`, and `show` are **not implemented**.

## Text output

The renderer prints a source heading, tab-separated columns, then warnings
prefixed with `Note:`. Missing models and empty tool lists display as `—`.
Untrusted terminal control bytes are escaped rather than executed.

## JSON output

The current envelope is an initial presentation contract, **not a stable registry
protocol**. A live snapshot with no matches has this shape:

```json
{
  "schemaVersion": 1,
  "source": "live",
  "sessions": [],
  "warnings": [
    "Fallback discovery: exact 'pi' process titles only. Session identity, model, and activity are unknown; Node launchers and in-process subagents may be omitted."
  ]
}
```

| Row field | Current live meaning |
| --- | --- |
| `instanceId` | `process-<pid>-<startTicks>` identifier; not a conversation ID or durable cross-boot identity. |
| `pid`, `cwd` | Inspected process ID and working directory. |
| `sessionId`, `name` | `null`: no exact session mapping. |
| `model`, `thinking` | `null`: no live selection information. |
| `activity` | `unknown`. |
| `evidence` | `unmatched`: no extension-backed mapping. |
| `freshness` | `unknown`: no telemetry heartbeat. |
| `activeTools` | Empty array: tools are not observed, not proof that none are running. |

`source` is `live` or `demo`. Always inspect `warnings`; a successful snapshot
does not guarantee complete process coverage. JSON does not yet include timestamps
or structured completeness indicators.

## Exit codes

| Code | Current behavior |
| --- | --- |
| `0` | Help or a successful snapshot, including empty or partial inventories. |
| `2` | Invalid arguments **or** discovery failure. Error text goes to stderr. |

The implementation currently catches both usage and discovery errors together.
The roadmap proposes a separate fatal-error code, but it is not implemented yet.
