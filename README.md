# pi-session-info

A local CLI and Pi extension for seeing running sessions and their activity,
plus recent saved sessions in the extension.

**Status: Linux live-status preview.** The extension publishes private metadata
for its own Pi session; the CLI and `/sessions` combine verified status records
with process-only discovery. Connected sessions show their name, model, thinking
level, and observed activity. Other processes say **Not connected**, rather than
repeating empty diagnostic columns. The Recent tab reads saved-session metadata
only. No automatic installation or network calls. Uninstrumented Node launchers may be omitted.

## Pi extension

From this checkout, test in a new Pi session:

```sh
pi -e ./src/extension/index.ts
```

Then enter `/sessions`. Use **Tab** or **←/→** to switch between **Running** and
**Recent** (RPC clients get equivalent menu options). Recent starts with the 10
newest saved sessions, excluding exact matches to running sessions; **Show more**
adds another 10. Rows show the project, saved name (or session ID), and file
modification time. Select a session for read-only details, **Refresh** to rescan,
or **Close** to dismiss. The list is a snapshot, not a watch view. To register
the local package persistently, explicitly run `pi install /absolute/path/to/pi-session-info`
and reload/restart Pi. Nothing is installed automatically. The extension uses
Node APIs and is typechecked against Pi 0.85.1; other host versions are unverified.

Recent rows use friendly ages such as **saved 2 hours ago**; details retain the
exact timestamp. **Pin session / Unpin session** in Running or Recent details
stores a favorite without changing the session itself. Recent marks pins with
**★** and offers **Pinned only / All recent**. Both views stay newest-first and
exclude matched running sessions. Pins outside the scanned history (including
deleted files or undiscovered custom directories) are not shown; running pins
appear in Recent once the session is no longer running and history is refreshed.

Pins persist across Pi instances in `$XDG_STATE_HOME/pi-session-info/pins`, or
`~/.local/state/pi-session-info/pins`. Only versioned session IDs are stored,
with private permissions and one atomic file per session. No transcripts or Pi
settings are modified. Pin storage is created only when you explicitly pin.
Use native **`/resume`** for search, Current Folder / All filtering, and resuming;
the extension does not duplicate those controls or automatically switch sessions.

History is loaded lazily and cached until Refresh or closing `/sessions`. It
does not display prompts or tool outputs and does not infer idle from old files.
Use `/name` to give sessions recognizable names, and `/resume` to continue them.
Unconnected processes cannot always be mapped to saved files: a coverage note
explains this limitation instead of filling historical rows with “unknown”.
Custom session directories belonging to other, unconnected launchers cannot be
discovered automatically.

History searches `~/.pi/agent/sessions` (honoring `PI_CODING_AGENT_DIR` and
`PI_CODING_AGENT_SESSION_DIR`), plus the viewer's session directory and directories
reported by connected sessions. The read-only reader supports v3 files, scans at
most 10,000 directory entries / 2,000 files, and reads a 64 KiB header window plus
a 256 KiB tail per file. Large files can lack a discoverable saved name; partial
coverage is reported. Symlink paths and non-regular files are skipped.

### Getting real status from existing sessions

Each Pi instance must load this extension. If it already loads this checkout,
run `/reload` in that instance; otherwise explicitly install the local package
first, then reload/restart. Reloading only the viewer cannot instrument other
processes. Nothing in this project changes your Pi configuration automatically.

Status tracks the observed parent Pi loop, including concurrent tools and explicit
UI waiting. It does not claim to track independent background agents. A report
older than 20 seconds (or in the future) is marked **Stale**, with its last observed
activity retained. A stale report does not mean idle or dead.

### Private registry

Metadata is written atomically with private directory/file permissions (0700/0600).
The registry is selected by `PI_SESSION_INFO_REGISTRY_DIR`, then a valid
`XDG_RUNTIME_DIR`, otherwise `~/.cache/pi-session-info/run`. The CLI can override
it with `--registry-dir PATH`. Viewer and publishers must use the same directory.
Unsafe paths and invalid or oversized records are rejected, with read failures
reported as warnings. Status includes session paths/names and tool names/IDs,
never prompts, tool arguments/results, credentials, or environment dumps.

Live records are matched against Linux boot identity and process start ticks,
not PID or working directory alone. Registry files left by crashes are ignored
when the process identity no longer matches; reading does not delete them.
The local trust boundary includes other processes running as your user; this is
not an authentication protocol against a malicious same-user process. Reads are
bounded to 128 directory entries and 128 KiB per record, with skipped coverage
reported explicitly.

## Stack

TypeScript + Bun for the CLI, tests, and development workflow. The Pi
extension uses Node-compatible TypeScript and shares discovery with the CLI.
No daemon, database, or web server. The extension uses Pi's host TUI components;
Pi packages are pinned development dependencies for checking and tests.

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

Without `--demo`, the CLI combines Linux `/proc` with the private status registry.
Demo paths, IDs, models, and PIDs are fictional.

## Documentation website

The Astro + Starlight documentation site lives in `website/` and has separate dependencies.

```sh
cd website
bun install
bun run dev
```

Run `bun run check` and `bun run build` inside `website/` to validate the site.
Use `bun run preview` to preview its static build locally.

## Repository layout

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
