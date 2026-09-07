# Development

- Read `docs/implementation-plan.md` before implementing a milestone.
- Keep fallback limitations explicit: demo data is never live discovery.
- Use TypeScript and Bun; extension/shared code must also run in Pi's Node runtime.
- Preserve provenance and unknown states. Never infer idle from an old transcript.
- No prompts, tool arguments, outputs, auth, or environment dumps in status records.
- Do not install extensions into the user's Pi configuration without permission.
- Use synthetic fixtures and injected clocks/process providers in tests.
- Run `bun run check`. Keep changes small; use Conventional Commits.
