---
title: Discovery & privacy
description: Understand the evidence behind a row and the limits of the current observer.
---

## What discovery does today

1. Enumerates numeric entries in Linux `/proc`.
2. Restricts inspection to entries owned by the current user.
3. Matches only a process whose `comm` title is exactly `pi`.
4. Skips zombie and dead processes.
5. Reads the working directory and checks process start ticks before and after
   inspection to reduce PID-reuse races.
6. Sorts rows by PID and reports inspection failures as warnings.

This is conservative process discovery, not verified conversation discovery.
A matching process title alone does not authenticate a Pi instance. Custom Node
launchers can be missed; in-process subagents are not separate process rows.
The current identifier lacks boot identity and should not be persisted as a
globally unique instance key.

## Keep these concepts separate

| Concept | Current observation |
| --- | --- |
| Process presence | A matching process was inspectable during the snapshot. |
| Conversation identity | Unknown; no registry or transcript mapping. |
| Activity | Unknown; no lifecycle events are collected. |
| Freshness | Unknown; no heartbeat is collected. |

An unknown value is not idle, zero usage, or an empty workload. A working directory
does not uniquely identify a conversation. Recently modified transcripts would
not prove a session is alive, and this implementation does not read them.

## Privacy boundary

The current observer reads process ownership, title, stat metadata, and working
directory. It does not read process arguments or environments, prompts, tool
arguments/results, credentials, or saved transcripts. It makes no model or network
calls and starts no daemon or listener.

Working directories and PIDs are still private metadata. Review terminal output
and JSON before sharing them. Terminal output escapes control bytes; downstream
JSON consumers should treat strings as untrusted input when displaying them.

## Planned telemetry

The proposed registry will separate process birth identity, publisher activation,
and conversation identity. Freshness will be distinct from liveness: a stale
heartbeat must not imply a dead process or idle session.

Private atomic files, bounded validation, lifecycle events, and exact session
mapping are design requirements, **not protections or features already shipped**.
See the [roadmap](../development/) for milestone order.
