SUPERGOAL_PHASE_START
Phase: 4 of 6 — Wire Runtime Flow
Task: Register memory candidate and gate processors in runtime/view worker surfaces.
Mandatory commands:
- pnpm typecheck
- node --experimental-sqlite --import tsx --test tests/processor-view-system.test.ts tests/runtime-tick.test.ts tests/program-runtime.test.ts
- pnpm mf processor report
Acceptance criteria: 6
Evidence required:
- Processor report output
- Integration test output
- Dry-run assertion output
Depends on phases: 1, 2, 3

## Work

Make the memory framework executable through existing runtime infrastructure.

Expected implementation direction:

- Add view processor definitions for memory candidate and memory gate compilers.
- Register worker functions where existing view processors are registered.
- Integrate into runtime tick or on-demand view processing in a controlled way.
- Preserve compatibility with existing ProgramRuntime memory-producing programs.

## Acceptance Criteria

- [ ] Worker catalog lists memory candidate and memory gate processors with correct speed/autonomy policy.
- [ ] Runtime/view processor flow can generate candidates and durable memories from seeded observations/views in tests.
- [ ] Existing feedback-learning, routing-learning, language-learning, and project ambient tests remain compatible.
- [ ] Context pack and view subscription APIs can retrieve new memory view families without special-case schema changes.
- [ ] Dry-run mode does not persist memory candidates or durable memories.
- [ ] `pnpm mf processor report` has no warnings for built-in processors introduced by this run.

## Mandatory commands

- `pnpm typecheck`
- `node --experimental-sqlite --import tsx --test tests/processor-view-system.test.ts tests/runtime-tick.test.ts tests/program-runtime.test.ts`
- `pnpm mf processor report`

## Evidence required

- Processor report output.
- Integration test output.
- Dry-run assertion output.

[Agent will print SUPERGOAL_PHASE_VERIFY and SUPERGOAL_PHASE_DONE here during execution]
