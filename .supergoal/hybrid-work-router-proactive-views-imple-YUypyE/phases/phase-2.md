SUPERGOAL_PHASE_START
Phase: 2 of 6 — Build Focus Set
Task: Implement scheduled/batch work focus set generation from route candidates.
Type: brownfield, architecture, feature
Mandatory commands: pnpm typecheck; node --experimental-sqlite --import tsx --test tests/work-focus-set.test.ts
Acceptance criteria: 6
Evidence required: work focus set test output; example work.focus_set JSON; typecheck summary
Depends on phases: 1

## Why

The system must represent several simultaneous work lanes before updating project-specific views.

## Work

- Add a compiler module such as `packages/views/work-router/focus-set.ts`.
- Register `work.focus_set` in `packages/view-system/builtins.ts`.
- Group recent route candidates and supporting observations into lanes using deterministic scoring.
- Keep an LLM-ready options shape, but ensure default operation is deterministic and testable without credentials.
- Include attention share and lane confidence.
- Add tests in `tests/work-focus-set.test.ts`.

## Acceptance criteria (all must pass — verify each in transcript)

- The compiler writes a `work.focus_set` ContextView from recent route candidates and observations.
- Output includes `active_lanes`, `attention_share`, `lane_key`, `lane_kind`, `source_records`, `candidate_route_ids`, and confidence.
- Multiple simultaneous project/topic/communication lanes are supported.
- Related browser research can attach to an active project lane when route evidence supports it.
- Unrelated interruptions are represented as low-attention lanes or excluded from project lanes.
- Default operation does not require external LLM credentials.

## Mandatory commands (run each, surface last ~10 lines + exit code)

- `pnpm typecheck`
- `node --experimental-sqlite --import tsx --test tests/work-focus-set.test.ts`

## Evidence required in transcript

- Test output for multi-project and interruption scenarios.
- Example `work.focus_set` JSON with at least two lanes.
- The `pnpm typecheck` result.

## Notes

- This view is the gate before project-specific current state.
- Do not make `state.surface` depend on this batch layer.

---

The agent will, during execution, print SUPERGOAL_PHASE_START (above),
do the work, then print SUPERGOAL_PHASE_VERIFY, MEMORY_SAVED, and
SUPERGOAL_PHASE_DONE in order. On failure, the agent follows the
3-strike recovery protocol in .supergoal/hybrid-work-router-proactive-views-imple-YUypyE/PROTOCOL.md without further
instruction needed here.
