# pi-session-info

A local CLI and Pi extension for seeing running sessions and their activity,
plus recent saved sessions in the extension.

**Status: Linux live-status preview.** The extension publishes private metadata
for its own Pi session; the CLI and `/sessions` combine verified status records
with process-only discovery. Connected sessions show their name, model, thinking
level, and observed activity. Other processes say **Not connected**, rather than
repeating empty diagnostic columns. The Recent tab reads saved-session metadata
only. No automatic installation or network calls. Uninstrumented Node launchers may be omitted.

CLI text marks **this process** only when both its PID and process birth identity match;
PID equality alone is not treated as session identity.

## Pi extension

The extension also registers the agent-callable `list_pi_sessions` tool. Its
default scope is running (no history scan); `scope` accepts `running`, `recent`,
or `both`. `groupByCwd`, `limit` (maximum 100), and `offset` (up to 10,000) are
supported, as are exact `cwd`, `sessionId`, and live `instanceId` filters.
Filters are applied before pagination and grouping; cwd is not normalized to a
git root and does not match descendants. `nextOffset` is null on the final
page. Results retain session identity and provenance; saved metadata never
implies stopped or idle state. Responses include bounded counts,
`historyDirectories`, page `projectDirectories`, an always-incomplete
`coverage` object, and warnings; discovery can be partial. Grouping is by
exact cwd on the returned page, and each tool call performs a fresh scan.

Tool output defaults to `detail: "compact"`: running rows retain instance/session
identity, PID, cwd, task name, provider/model/thinking, activity, evidence,
freshness, active tool names, and `lastChangeAge`; recent rows retain saved
session identity, cwd, task name, and `lastSavedAge` without live-status fields.
Long session-file paths and other full-only metadata are omitted. Set
`detail: "full"` to retain the previous complete `{ kind, session }` row shape
and exact timestamps/paths. In compact grouped output, `groups[].sessions` are
identity references rather than duplicate full rows; full grouped output keeps
the previous rows for compatibility.

Warnings are derived from the complete live inventory before filtering or
pagination. A shared PID warning includes its process identity when available
and notes that killing the PID affects every activation in that process.

From this checkout, test in a new Pi session:

```sh
pi -e ./src/extension/index.ts
```

Then enter `/sessions`. Use **Tab** or **←/→** to switch between **Running** and
**Recent** (RPC clients get equivalent menu options). Recent starts with the 15
newest saved sessions, excluding exact matches to running sessions; **Show more**
adds another 10. Rows show the project, saved name (or session ID), and file
modification time. Select a session for read-only details, **Refresh** to rescan,
or **Close** to dismiss. The list is a snapshot, not a watch view. To register
the local package persistently, explicitly run `pi install /absolute/path/to/pi-session-info`
and reload/restart Pi. Nothing is installed automatically. The extension uses
Node APIs and is typechecked against Pi 0.85.1; other host versions are unverified.

Recent rows use friendly ages such as **saved 2 hours ago**; details retain the
exact timestamp and are read-only. Legacy pin files, if present, are left
untouched and are no longer used.
Use native **`/resume`** for search, Current Folder / All filtering, and resuming;
the extension does not duplicate those controls or automatically switch sessions.

### Dashboard controls

The TUI keeps tabs, a compact summary, snapshot age, and actions outside the
scrolling rows. Columns adapt to terminal width, prioritizing session names on
narrow screens. **Discovery details** separates scan warnings and next steps
from tab-specific help. The overview shows a warning count only for reported
scan issues, not permanent limitations. No warnings does not guarantee every
session was found.

- **Tab / ← / →**: switch tabs; each tab keeps its selected session.
- **↑ / ↓**, **Page Up / Down**: navigate; **Enter**: details.
- **r**: refresh; **m**: show 10 more.
- **c**: discovery details; **Escape**: close, or cancel an active load.

Loading paints immediately with an animated activity indicator, elapsed time,
and the current step. Recent reports real files checked, saved sessions found,
and folders visited; these counts are before running-session exclusions, not a
completion percentage. The total scan size is not known in advance. First loads
explain why scanning is needed; refreshes label the retained rows as previous
results. RPC clients get a static loading explanation and cancellation, not live
progress. Cancellation or failed refresh leaves the prior snapshot and timestamp
intact; press **r** to retry. Selection follows session identity through reordering, details, and tab
switches; Show more selects the first newly revealed session. Display ages repaint
every 15 seconds, but data is scanned
only on initial load / Refresh—not a watch loop. Linux process discovery itself
is a small synchronous scan; cancellation takes effect at history I/O boundaries.
RPC clients receive equivalent menus and a cancellable loading dialog.

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

## Releases

Release Please runs on pushes to `main` (or manually in GitHub Actions). It opens
or updates a release PR with the root `package.json` version and `CHANGELOG.md`.
Merge that PR to create a `vX.Y.Z` tag and GitHub release. The website is not
versioned separately, and nothing is published to npm; the package remains private.

Conventional `feat` and `fix` commits drive releases. While below 1.0, breaking
changes bump the minor version, features bump the minor, and fixes bump the patch.
Chore-only changes do not trigger a release.

The workflow uses `GITHUB_TOKEN` and requires Settings → Actions → General →
“Allow GitHub Actions to create and approve pull requests”. PRs and tags created
with this token do not trigger other workflows. If release PR CI or tag-triggered
publishing is added later, use a GitHub App token or a scoped PAT instead.

## Development

Requires Bun 1.3 or newer.

```sh
bun install
bun run demo
bun run start --demo --json
bun run start --help
bun run check
```

`bun run format` formats supported files with Oxfmt; `bun run lint` runs Oxlint
(`bun run lint:fix` applies safe fixes). `bun run check` checks formatting, lint,
types, and tests. Generated output and dependencies are excluded.

`bun install` installs the local Lefthook Git hooks. The `pre-commit` hook checks
formatting and lint on staged files without rewriting or staging changes. Run
`bun run format` to fix formatting before committing. The `commit-msg` hook uses
commitlint to require Conventional Commits, including for merge and revert messages.
Use `type(scope): description` (scope optional), for example
`feat(sessions): add filtering` or `fix: preserve unknown status`. Allowed types:
`build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`,
and `test`. Breaking changes can use `!`, such as `feat!: change output format`.
To reinstall hooks manually, run `bun run lefthook install`.
Local hooks can be bypassed with `--no-verify`; they do not enforce remote policy.

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

### GitHub Pages

The documentation deploys to https://fil1994.github.io/pi-session-info/ through
`.github/workflows/deploy-website.yml`. Website changes in pull requests are
checked and built without deploying. After merging to `main`, website or workflow
changes deploy automatically; the workflow also supports manual runs.

Repository **Settings → Pages → Source** must be **GitHub Actions**. Astro's
`site` and `base` settings in `website/astro.config.mjs` target this repository's
Pages URL. Local development and preview also use the `/pi-session-info/` base.

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
