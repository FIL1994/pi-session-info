---
title: Discovery & privacy
description: Live status, Linux identity matching, and private metadata.
---

## Connected status

The extension publishes one private metadata record per activation. Records are
matched to Linux processes using PID plus boot identity and start ticks; PID or
working directory alone is never sufficient. The publisher observes the parent
lifecycle, concurrent tool names/IDs, explicit UI waiting, model, thinking
level, and session name. It does not claim to track independent background
agents.

Heartbeats are emitted every 5 seconds. A report older than 20 seconds or dated
in the future is **Stale**. Stale is not idle or dead: last observed activity is
retained. Unknown values and their provenance remain unknown rather than being
inferred from old transcripts.

## Uninstrumented fallback

Linux fallback discovery is limited to the exact `pi` process title. It may miss
Node launchers and in-process subagents. Such rows are labeled **Not connected**
instead of repeating diagnostic columns. This is process presence, not verified
conversation identity or activity.

## Registry and privacy

The registry contains metadata only and uses atomic files in a private `0700`
directory with `0600` files. Directory precedence is:

1. `PI_SESSION_INFO_REGISTRY_DIR`
2. a valid `XDG_RUNTIME_DIR` location
3. `~/.cache/pi-session-info/run`

The CLI also accepts `--registry-dir PATH`. Unsafe, malformed, oversized, or
unowned records are rejected. No prompts, tool arguments/results, credentials,
environment dumps, or transcript content are recorded. Paths and names remain
private metadata.

This slice is Linux-only and has no network service, daemon, history, or watch
mode. Demo data is always synthetic.
