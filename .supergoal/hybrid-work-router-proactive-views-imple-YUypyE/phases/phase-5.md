SUPERGOAL_PHASE_START
Phase: 5 of 6 — Wire Runtime
Task: Register the new route/focus/project processors in runtime and docs.
Type: brownfield, integration, feature
Mandatory commands: pnpm typecheck; node --experimental-sqlite --import tsx --test tests/iii-runtime.test.ts tests/runtime-tick.test.ts tests/processor-view-system.test.ts; pnpm mf processor report
Acceptance criteria: 5
Evidence required: worker catalog/processor report output; integration test output; docs updated
Depends on phases: 1, 2, 3, 4

## Why

The new architecture must be executable and discoverable through existing runtime/worker surfaces.

## Work

- Register route candidate, focus set, and project current processors/view compilers in the appropriate registries.
- Update worker catalog output in `packages/iii-runtime/workers.ts` or related view-worker definitions.
- Wire runtime tick or view processor flow so seeded observations can generate `work.focus_set` and `project.current` in tests.
- Update architecture docs and package README.
- Add or update integration tests.

## Acceptance criteria (all must pass — verify each in transcript)

- Worker catalog includes the new processors/compilers with correct speed/autonomy policy.
- Runtime tick or view processor flow can generate `work.focus_set` and `project.current` from seeded observations in test mode.
- `state.surface` remains documented and implemented as a separate realtime path.
- `pnpm mf processor report` has no warnings for built-in processors produced by this work.
- Docs describe realtime surface, realtime route candidates, scheduled focus set, and project current downstream.

## Mandatory commands (run each, surface last ~10 lines + exit code)

- `pnpm typecheck`
- `node --experimental-sqlite --import tsx --test tests/iii-runtime.test.ts tests/runtime-tick.test.ts tests/processor-view-system.test.ts`
- `pnpm mf processor report`

## Evidence required in transcript

- Processor report output showing no built-in warnings.
- Integration test output.
- List of docs updated.

## Notes

- Prefer extending existing `createViewProcessorDefinitions` and worker catalog patterns.
- Avoid network/LLM requirements in tests.

---

The agent will, during execution, print SUPERGOAL_PHASE_START (above),
do the work, then print SUPERGOAL_PHASE_VERIFY, MEMORY_SAVED, and
SUPERGOAL_PHASE_DONE in order. On failure, the agent follows the
3-strike recovery protocol in .supergoal/hybrid-work-router-proactive-views-imple-YUypyE/PROTOCOL.md without further
instruction needed here.
