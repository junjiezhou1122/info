SUPERGOAL_PHASE_START
Phase: 2 of 6 — Create View System
Task: Add an open ViewSpec registry package for extensible view families.
Type: brownfield, architecture, implementation, tests
Mandatory commands: pnpm typecheck; node --experimental-sqlite --import tsx --test tests/view-system.test.ts; node --experimental-sqlite --import tsx --test tests/view-system-scenarios.test.ts
Acceptance criteria: 6
Evidence required: exported API list, focused test output, typecheck summary
Depends on phases: 1

## Why

New view families must be registered and queried without editing a closed catalog.

## Work

- Add `packages/view-system/package.json`.
- Add `packages/view-system/index.ts`, `spec.ts`, `registry.ts`, `query.ts`, and `builtins.ts`.
- Register the package in `pnpm-workspace.yaml` and root dependencies as needed.
- Add focused tests in `tests/view-system.test.ts`.
- Add scenario tests in `tests/view-system-scenarios.test.ts`.
- Provide a legacy adapter for current `packages/views/catalog.ts` definitions if useful, but do not make the new package depend on server/UI code.

## Acceptance criteria (all must pass — verify each in transcript)

- `ViewSpec` supports open `view_type`, open `subject` metadata, lifecycle/stability, purpose, schema hint, examples, default query, and producer ownership.
- Registry APIs can register many specs, list by namespace/family, fetch by exact view type, and merge legacy catalog entries.
- Query helpers can filter stored `ContextView` records by `view_type`, prefix, labels, subject, stability, and status without requiring closed categories.
- `rg "type ScopeKind|enum ScopeKind|project \\| task \\| topic \\| course \\| person" packages/view-system` exits non-zero or prints no closed ontology.
- `tests/view-system.test.ts` demonstrates dynamic registration of `youtube.caption_fragment`.
- `tests/view-system-scenarios.test.ts` covers project/coding, writing, YouTube learning, web research, personal memory, current surface, and automation view families without core schema changes.

## Mandatory commands (run each, surface last ~10 lines + exit code)

- `pnpm typecheck`
- `node --experimental-sqlite --import tsx --test tests/view-system.test.ts`
- `node --experimental-sqlite --import tsx --test tests/view-system-scenarios.test.ts`

## Evidence required in transcript

- Print exported API names from `packages/view-system/index.ts`.
- Print focused test output.
- Print typecheck exit code and last lines.

## Notes

Use `ContextView` as the stored view shape. The new package should provide specs and helpers, not a second database.

---

The agent will, during execution, print SUPERGOAL_PHASE_START (above),
do the work, then print SUPERGOAL_PHASE_VERIFY, MEMORY_SAVED, and
SUPERGOAL_PHASE_DONE in order. On failure, the agent follows the
3-strike recovery protocol in .supergoal/info-view-first-proactive-agent-os-archi-mdVPA0/PROTOCOL.md without further
instruction needed here.
