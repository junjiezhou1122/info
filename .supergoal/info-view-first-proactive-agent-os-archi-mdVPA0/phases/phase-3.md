SUPERGOAL_PHASE_START
Phase: 3 of 6 — Add MF View CLI
Task: Add a thin CLI for listing, showing, serializing, and searching views.
Type: brownfield, tooling, implementation
Mandatory commands: pnpm typecheck; pnpm mf view list; pnpm mf view show state.surface
Acceptance criteria: 5
Evidence required: view list output, view show output, typecheck summary
Depends on phases: 2

## Why

Users and agents need a simple operational surface: list, inspect, and query views.

## Work

- Add `scripts/mf.ts`.
- Add root package script `"mf": "node --experimental-sqlite --import tsx scripts/mf.ts"`.
- Implement `view list`, `view show <view_type>`, `view json <view_type>`, and `view search <query>`.
- Use `@info/view-system` APIs for registry and query behavior.
- Read stored views through `ContextStore` when available; handle empty stores gracefully.

## Acceptance criteria (all must pass — verify each in transcript)

- `pnpm mf view list` prints registered view specs with view type, lifecycle, producer, and purpose.
- `pnpm mf view show state.surface` prints the spec and latest stored views when present, or an explicit empty state when no stored view exists.
- `pnpm mf view json state.surface` prints valid JSON.
- `pnpm mf view search surface` returns at least `state.surface`.
- `scripts/mf.ts` imports from `@info/view-system` and does not duplicate registry definitions.

## Mandatory commands (run each, surface last ~10 lines + exit code)

- `pnpm typecheck`
- `pnpm mf view list`
- `pnpm mf view show state.surface`

## Evidence required in transcript

- Print sample output for `view list`.
- Print sample output for `view show state.surface`.
- Print typecheck exit code and last lines.

## Notes

Keep output readable for humans but stable enough for agents. `view json` is the machine-readable path.

---

The agent will, during execution, print SUPERGOAL_PHASE_START (above),
do the work, then print SUPERGOAL_PHASE_VERIFY, MEMORY_SAVED, and
SUPERGOAL_PHASE_DONE in order. On failure, the agent follows the
3-strike recovery protocol in .supergoal/info-view-first-proactive-agent-os-archi-mdVPA0/PROTOCOL.md without further
instruction needed here.
