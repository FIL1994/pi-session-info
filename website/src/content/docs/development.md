---
title: Development & roadmap
description: Repository layout, checks, website commands, and planned milestones.
---

## Application development

From the repository root:

```sh
bun install
bun run check
```

`check` runs strict TypeScript checking and Bun tests. Use synthetic fixtures and
injected clocks/process providers for new tests. Extension and shared code must
also run in Pi's Node runtime; do not introduce Bun-only APIs there.

| Path | Purpose |
| --- | --- |
| `src/cli.ts` | CLI flags and entry point. |
| `src/discover.ts` | Current Linux process discovery. |
| `src/core/types.ts` | Presentation types and unknown states. |
| `src/format.ts` | Text output and terminal-control escaping. |
| `src/demo.ts` | Synthetic preview inventory. |
| `src/extension/index.ts` | Read-only `/sessions` command. |
| `tests/` | Bun tests. |
| `docs/implementation-plan.md` | Detailed architecture and acceptance gates. |
| `website/` | This standalone Astro + Starlight site. |

## Documentation development

The website has its own package and lockfile; its dependencies are separate from
the CLI and extension.

```sh
cd website
bun install
bun run dev
```

Open the local URL printed by Astro. To validate and build:

```sh
bun run check
bun run build
bun run preview
```

Pages live in `website/src/content/docs/`; navigation is configured in
`website/astro.config.mjs`. Styling uses Tailwind CSS 4 through its Vite plugin,
with the Starlight Tailwind compatibility stylesheet (no Tailwind preflight).
Theme tokens and site-wide styles live in `website/src/styles/global.css`.
Keep both light and dark themes readable when changing styles.

Static output is written to `website/dist/`. No hosting
provider is configured. Before deployment, set Astro's `site` URL and, if hosting
under a subpath, its `base` and verify links in that deployment.

## Implementation status

Implemented: a synthetic preview, plain-text and JSON output, strict checks and
tests, preliminary Linux fallback discovery, and the `/sessions` viewer.

The preliminary fallback is **not completion of M1–M3**. Read
`docs/implementation-plan.md` before implementing a milestone; it is the source
of truth for detailed requirements.

| Milestone | Planned work |
| --- | --- |
| M1 | Registry schema, validation, private filesystem primitives, process identity. |
| M2 | Lifecycle reducer, publisher, and extension-backed live inventory. |
| M3 | Stronger Linux discovery and explicit reconciliation/provenance. |
| M4 | Bounded saved-history metadata and opt-in content details. |
| M5 | Watch mode, output polish, filtering, and macOS provider. |
| M6 | Packaging, clean-install checks, compatibility, and release readiness. |

The next planned step is **M1**, followed by M2 as the first instrumented vertical
slice. Watch output, historical usage totals, registry path overrides, session
detail commands, and a published executable are not available today.

## Constraints

- Local, passive observation; no session interruption, messages, or mutation.
- No prompt, tool argument/result, auth, or environment dumps in status records.
- No inference of idle from old transcripts.
- No automatic installation into the user's Pi configuration.
- Preserve provenance, partial coverage, and unknown states.
