# Implementation plan: pi-session-info

## Incremental implementation update

The dashboard-polish slice adds responsive columns, fixed TUI headers/actions,
scrollable discovery details, per-tab identity-based selection, and timestamped
snapshots. Cancellable history reads keep previous rows visible while loading;
failed/cancelled loads cannot replace the snapshot with partial/late results.
Loading screens keep row navigation and tab switching active; switching tabs
aborts the load and restores the destination snapshot immediately. History parsing
and buffered directory walks yield periodically to keyboard/timer events. Cancelled
loads retain the previous snapshot and require Refresh to retry.
Only display ages repaint periodically; inventory remains manually refreshed.
Synchronous Linux process scans are not interruptible mid-scan. This does not
claim watch-mode or all M5 gates. Native `/resume` features remain native.

Discovery details separates reported scan issues and next steps from tab-specific
help. Permanent process-discovery limitations no longer inflate the overview's
warning count; they remain explicit in help and unchanged in CLI/JSON warnings.
Unknown warnings are retained. An unloaded snapshot or failed attempt is not
presented as a successful scan, and no warnings does not imply complete discovery.

Recent now displays relative saved ages (exact timestamps remain in details).
Session favorites are extension-owned, persistent ID-only pin files under XDG
state, separate from transcripts and the live registry. Detail actions pin/unpin;
Recent offers a pinned-only view without overriding running-session exclusions
or its newest-first order. The observer remains read-only toward Pi sessions:
native `/resume` owns search, project scope and session switching. Pin storage
is the sole new user-initiated persistent mutation, not session control.

The Recent-history slice now adds Running/Recent tabs to `/sessions`, with 15
saved sessions initially and Show more in batches of 10. History is metadata-only,
ordered by file modification time, lazily loaded and cached for the dialog until
Refresh. Exact live session IDs/files and the viewer's current session are excluded
before pagination. Unmapped processes remain a documented coverage limitation,
not fabricated stopped/idle states. This is a narrow M4 slice, not completion of
branch-aware content, usage accounting, or all M4 acceptance gates.

The live-status vertical slice adds a private validated registry, Linux birth
identity verification, lifecycle publishing and reconciliation. `/sessions`
offers project-first rows, read-only details and manual refresh; uninstrumented
processes use a single **Not connected** label. CLI JSON preserves unknowns and
provenance. Heartbeats are fresh for 20 seconds; stale observations retain their
last activity rather than becoming idle. Existing Pi instances require explicit
extension loading/reloading. No configuration is changed automatically.

This does not claim completion of every M1–M3 acceptance gate. Uninstrumented
fallback still recognizes exact `pi` titles only; full history enrichment, watch, macOS, formal
coverage indicators and release packaging remain future work. Synchronous small
atomic writes are coalesced rather than using an asynchronous writer queue, so
shutdown cannot race a pending asynchronous rename. The remaining plan describes
the full target architecture and acceptance gates.

`/sessions` uses the shared reconciled inventory and metadata-only detail picker;
M4 can extend details with saved history. Keep slash commands user-facing; no
agent tool is needed. Test command registration, UI dismissal, no-UI mode, errors,
and multiple same-cwd instances. Do not install into user settings without permission.

## 1. Goal and scope

Build a small local CLI that answers: which Pi instances are alive, which session
each instance hosts, what it is doing, and when its activity last changed?
Show useful history on request without pretending historical data is live state.

The first release is a passive observer. It must not interrupt, resume, rename,
kill, or send messages to sessions. No LLM calls, telemetry, network listener,
daemon, or database. Do not automatically modify Pi settings during installation.

### Scaffold delivered

- [x] Bun/TypeScript project, strict checking, and unit tests.
- [x] Runnable synthetic table and versioned JSON preview.
- [x] Initial presentation types and terminal-control-byte escaping.
- [x] Preliminary Linux fallback and `/sessions` extension command.
- [x] Registry-backed process identity and lifecycle publishing (live-status preview).
- [ ] Transcript parsing and full milestone acceptance coverage.
- [ ] Watch mode, packaging, or installation into Pi.

The demo envelope is a starting contract, not a frozen public protocol. Finalize
the wire schema in M1 before promising compatibility.

## 2. Architecture and stack

Use one package initially, with narrow internal modules:

```text
Pi extension -> private atomic JSON registry -> registry reader --+
OS process provider ---------------------------------------------+-> reconcile
Pi JSONL files -> bounded metadata/history reader ----------------+      |
                                                                    table/JSON
```

Proposed additions:

```text
src/core/registry-schema.ts    Versioned wire schema and runtime validation
src/core/reconcile.ts          Pure matching/provenance decisions
src/core/activity.ts           Pure lifecycle reducer
src/registry/{paths,read,write}.ts
src/process/{types,linux,macos}.ts
src/history/{reader,tree,usage}.ts
src/extension/index.ts         Pi lifecycle wiring; Node APIs only
src/extension/publisher.ts     Serialized/coalesced atomic writer
src/cli/{args,table,watch}.ts   Split current entry point when warranted
tests/fixtures/               Synthetic sessions and proc/registry inputs
```

Bun runs the CLI and tests. Extension and shared modules use standard JS/Node
APIs, never Bun globals. Use real Pi type imports when the extension is added;
do not invent a reduced ExtensionAPI declaration. Pin a tested Pi development
dependency and declare/document the supported host version range at packaging.
Runtime-validate all disk input; TypeScript interfaces alone are not validation.
Prefer small explicit validators before introducing a schema library.

Do not add a monorepo, SQLite, React TUI, or background service for the MVP.

## 3. Identity, provenance, and freshness

Distinguish three entities:

1. **Process:** OS PID plus birth identity; PID alone is reusable.
2. **Publisher instance:** random UUID per extension activation, including reloads.
3. **Conversation:** Pi session ID plus optional session file and current leaf ID.

One PID may host successive conversations. One conversation may be resumed by
multiple PIDs. Subagents can run in the parent's process, so process count is not
conversation/subagent count. Never call every recently modified JSONL a live agent.

Registry schema v1 should include:

| Field | Semantics |
| --- | --- |
| schemaVersion | Integer protocol version; reject unsupported versions |
| instanceId, sequence | Activation UUID and monotonically increasing write sequence |
| pid, processIdentity | PID and platform birth identifier; include boot identity on Linux |
| startedAt, heartbeatAt | Publisher start and latest successful heartbeat, UTC ISO |
| activityAt | Last meaningful lifecycle activity; heartbeats do not update it |
| sessionId, sessionFile, leafId | Exact live mapping, nullable for unavailable values |
| cwd, sessionName | Current Pi session cwd/name, not merely OS launch cwd |
| mode | TUI/RPC/JSON/print if exposed by the supported host |
| provider, model, thinking | Current selected values; unknown remains null |
| activity | working/tool/waiting-user/idle/unknown |
| activeTools | Tool call IDs and names only, supporting concurrent tools |
| capabilities | Which lifecycle fields the host adapter can actually observe |

Keep liveness, freshness, and activity separate in the presentation model.
Evidence values are extension, inferred, or unmatched. An expired heartbeat means
**stale observation**, not necessarily dead process or idle session. Validate the
PID birth identity before treating registry state as current. A verified live PID
with stale telemetry should show stale + last observed activity, not fresh status.

Do not publish process environment, command arguments, prompts, thinking text,
tool inputs/results, credentials, or transcript excerpts. Paths and names are
still private metadata and require protected storage.

## 4. Extension lifecycle

Verify exact APIs against the selected supported Pi release before coding.
Current documentation exposes the events below, but other installed versions
may differ; record a compatibility matrix rather than guessing support.

| Event | Intended effect |
| --- | --- |
| session_start | Create activation state, capture identity, publish, start heartbeat |
| agent_start | Set working; capture current metadata |
| tool_execution_start | Add call ID/name to active map |
| tool_execution_end | Remove only that call ID; other tools may still run |
| ui_prompt_start/end | Track explicit waiting-for-user span, then restore derived state |
| agent_end | Do not assume idle: retries, compaction, or follow-ups may remain |
| agent_settled | Derive idle using current host idle state |
| session_info_changed | Refresh name |
| model_select / thinking_level_select | Refresh selected model and effective reasoning |
| session_tree | Refresh leaf and metadata |
| session_before_compact / compact / compact_failed | Track compaction without becoming stuck on cancellation |
| session_shutdown | Stop timer, drain/close publisher, remove only own activation record |

Reducer priority: waiting-user, then active tools, then host working, then idle;
unknown when required signals are unavailable. Lifecycle callbacks observe only:
never modify messages, return cancellation decisions, or change tools/models.
`agent_settled` describes the parent loop, not independent background agents.
Without an explicit subagent integration report their background work as unknown.

Initialize timers only at session_start, not in the extension factory. Unref the
heartbeat timer. Reload/new/resume/fork must tear down old state safely; don't keep
stale session contexts. Generation tokens prevent pending old writes from
recreating an activation file after shutdown. Make shutdown idempotent.

Suggested heartbeat: 5 seconds, stale after 20 seconds. These are configurable
defaults to validate, not guarantees. Coalesce bursts to at most one lifecycle
write per 250ms while preserving the final state; no per-token disk writes.
Record heartbeats during long silent tools without falsifying activity time.
Publication failures must not block tool execution or create repeated UI noise.

## 5. Registry and privacy

Path precedence: explicit CLI `--registry-dir` / publisher environment override
`PI_SESSION_INFO_REGISTRY_DIR`, then a private directory under valid
`XDG_RUNTIME_DIR`, otherwise `~/.cache/pi-session-info/run`. Both components use the
same resolver. Paths derive from the current user, never machine-specific values.

- Directory mode 0700; files 0600 on POSIX. Refuse unsafe existing ownership,
  permissions, or symlink paths; never chmod an unrelated existing directory.
- One file per activation UUID, not PID. Write to a unique same-directory file
  opened exclusively, close, then atomic rename. Serialize writers.
- Reader accepts only bounded regular files owned by the current user; reject
  symlinks and avoid lstat/open races using supported no-follow/descriptor checks.
- Limit record bytes, string lengths, tool counts, and total files processed;
  expose skipped counts and reasons rather than silently claiming full coverage.
- Missing directory is valid first-run state. Permission denial/corruption is a
  warning or failure, not an empty healthy inventory.
- Read commands do not delete stale records. Add explicit cleanup only later,
  with ownership and activation/process identity verification.
- Local same-user processes are trusted to the same degree as Pi itself. This
  protocol does not protect against a malicious process running as that user.

No full process-environment reads for fallback discovery. Avoid exposing auth or
other secrets incidentally present in argv or child-process output.

## 6. Process discovery and reconciliation

Linux first: enumerate numeric `/proc` entries for current UID, parse stat safely
(comm can contain spaces/parentheses), capture start ticks plus boot ID, cwd,
PPID, and terminal where available. Race-safe handling of disappearing PIDs and
access denial. Match supported Pi invocation signatures, not substring `pi`.
Test `pi`, Node launcher invocations, custom launch paths, and bridge processes;
do not count exec bridges as Pi instances. Report discovery limitations.

Prefer exact registry mapping. For uninstrumented Pi processes, list cwd and
identity with unknown activity. Optional history candidates may be suggested by
cwd/time, but never silently select the newest transcript: it may be a subagent,
an older resumed conversation, or another terminal in the same directory.
Represent multiple candidates explicitly and keep inferred values labelled.

macOS follows behind a ProcessProvider interface using argv-array subprocess
calls (not shell interpolation), bounded output/timeouts, and documented lower
confidence where birth identity/cwd cannot be obtained. Unsupported platforms
should explain degraded capabilities. Do not promise Windows in the MVP.

## 7. Saved history enrichment

Resolve exact extension-provided sessionFile first. For fallback, honor explicit
`--session-dir`, `PI_CODING_AGENT_SESSION_DIR`, and Pi agent-directory overrides;
document CLI precedence and custom launch paths that cannot be discovered.
Never assume default cwd-to-directory encoding uniquely identifies a session.

Stream LF-delimited JSONL. Support current version 3 and explicitly tested older
versions without rewriting them. Handle unknown entry types, partial final lines,
invalid complete lines, rotation/replacement, and oversized records with warnings.
Bound memory and reads; provide completeness metadata when limits are reached.

Use the recorded live leaf ID for branch-aware latest user/assistant messages
and model changes. Without a live leaf, label results as last persisted activity:
tree navigation may not be reconstructible simply from the final line. Account
for retainedTail compaction checkpoints without counting copied messages twice.

Default overview exposes metadata only. An explicit `show ... --with-content`
may display bounded latest prompt/response excerpts; never hidden reasoning.
Extract plain text only, strip terminal control sequences, ignore embedded
instructions, and avoid reading image payloads into presentation state.
Task descriptions are excerpts or user-assigned names, not AI-generated summaries.

Usage accounting:
- Separate active-branch context estimates from cumulative full-file usage.
- Include assistant usage, tool-reported nested usage, and summary-entry usage.
- Do not count retainedTail copies a second time.
- Label totals as saved-session totals, not process uptime totals or billing.
- Unknown usage/cost is null, not zero. Distinguish partial from complete scans.
- Preserve input/output/cache-read/cache-write dimensions.
- Do not blindly add parent tool usage and separate child-session totals; their
  accounting may overlap. MVP does not produce an all-agent combined spend.

## 8. CLI contract and UX

Planned commands (not implemented by the scaffold):

```sh
pi-session-info                         # current overview
pi-session-info --json                  # versioned envelope; stdout JSON only
pi-session-info --watch                 # refresh TTY table, default 2 seconds
pi-session-info --watch --json          # one complete JSON envelope per LF (NDJSON)
pi-session-info --cwd /path/to/project
pi-session-info show <instance-id>      # disambiguate before showing details
pi-session-info show <instance-id> --with-content
```

Default columns: project, PID/TTY, status, model, last activity, evidence/freshness.
Detail view adds full paths, session ID/name, reasoning, active tool names,
heartbeat age, saved usage scope, and matching warnings. Keep full paths in JSON.
Define separate process uptime, publisher age, and conversation creation time.

TTY-aware widths, Unicode display-width handling, no color when piped or
NO_COLOR is set. Escape all untrusted control sequences. Stable row ordering;
don't clear non-TTY output. For non-TTY text watch, reject with guidance to JSON.
Handle resize, SIGINT, broken pipes, and disappearing rows without stack traces.

JSON envelope includes schemaVersion, source, generatedAt, sessions, warnings,
and coverage/completeness indicators. Each enriched field must have enough
provenance to avoid representing historical model state as live selection.
Exit 0 for valid snapshots including no sessions; 1 for fatal discovery/read
failure; 2 for invalid CLI usage. Partial snapshots carry structured warnings.

## 9. Milestones and acceptance gates

### M1 — Registry protocol and safe filesystem primitives

Finalize schema, validation, path resolver, process identity interface, and atomic
publisher/reader. Use synthetic records only; no Pi hooks yet.

**Gate:** roundtrip/version tests, permissions and symlink tests, concurrent writes,
partial files, invalid values, stale timestamps, generation/shutdown races, PID
reuse, clock skew, bounded input, and missing/unreadable directory behavior.

### M2 — Instrumented live inventory (first useful vertical slice)

Implement pure activity reducer and Pi lifecycle adapter with real host types.
Wire registry-backed CLI discovery and exact session mapping; no history needed.
Load only through explicit `pi -e ./src/extension/index.ts` in a test session.

**Gate:** two sessions in one cwd remain distinct; idle heartbeat stays fresh;
parallel tools remain active until all complete; UI waiting restores state;
abort/error/retry/follow-up/compaction do not cause false idle or stuck tools.
Reload, /new, /resume, /fork, and shutdown leave no active duplicate publisher.
Verify Node runtime compatibility and no stdout contamination in RPC/JSON modes.

### M3 — Linux fallback and reconciliation

Implement /proc provider, unmatched process display, and honest candidate mapping.
Extension-backed rows retain priority. Do not require the extension to list PIDs.

**Gate:** fake proc fixtures cover missing permissions, PID exits/reuse, unusual
comm values, Node launchers, zombies, duplicate cwd, bridge exclusion, and no Pi.
Actual process smoke test runs without modifying any live Pi instance.

### M4 — History metadata and opt-in detail

Implement bounded JSONL reader, leaf-aware enrichment, usage accounting, and show.
Cache by file identity/size/mtime and incremental offset where safe; invalidate
on replacement/truncation. Never rescan full histories every watch tick.

**Gate:** synthetic fixtures cover branches, compaction retainedTail, resumed
sessions, same-cwd subagents, malformed/partial lines, custom directories,
unknown versions, missing usage, nested usage, and large image-bearing entries.
Default output contains no prompt/result text. Manual totals match fixture sums.

### M5 — Watch, polished output, and macOS provider

Add filtering, stable table rendering, NDJSON watch, bounded scheduling without
overlapping scans, signal handling, and capability-aware macOS support.

**Gate:** injected-clock watch tests, terminal injection/Unicode/narrow width,
NO_COLOR, non-TTY behavior, stale-to-fresh transitions, shutdown and broken pipes.
Benchmark synthetic 100-instance registry and large histories; aim for warm
registry snapshots under 200ms and bounded memory on documented hardware.
Publish measured results instead of treating targets as established performance.

### M6 — Packaging and release readiness

Select package name after availability check. Add CLI bin output and Pi extension
manifest, include all extension/shared sources, and test a packed artifact in a
clean environment. Decide whether Bun is required for end users or compiled CLI
artifacts are worth maintaining. Keep development package private until ready.

Document CLI-only versus extension-assisted installation, uninstall, paths,
privacy, status semantics, supported Pi versions/OSes, and troubleshooting.
Do not auto-register into global settings. Existing sessions must explicitly
load/reload the extension before reliable live status becomes available.

**Gate:** clean-install smoke test, Bun CLI + Node-hosted extension tests, no
personal paths/data in package, and successful M1–M5 acceptance checks. Choose
license and release workflow before publishing; no remote repo is required now.

## 10. Deferred work and research checkpoints

- Explicit integration with subagent extensions for in-process background work;
  use documented event protocols, never infer solely from names or transcripts.
- Optional terminal focus/tmux integration, only after read-only MVP is stable.
- Historical search, notifications, remote hosts, dashboards, and Windows.
- Session mutation and remote control require a separate security/design review.

Before M2, read the installed host's full extensions documentation and relevant
session-format/package docs, inspect event types, and run minimal lifecycle
probes. In particular confirm agent_settled, UI prompt spans, shutdown-on-reload,
and model/thinking notifications on each declared compatible Pi version.
Prefer a documented minimum version over silently unreliable compatibility.

Useful upstream references (verify against the version being targeted):
- https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/extensions.md
- https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/session-format.md
- https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/packages.md

Next: validate the live slice in multiple explicitly loaded Pi instances, then
close remaining M1–M3 acceptance gaps before adding history or watch mode.
