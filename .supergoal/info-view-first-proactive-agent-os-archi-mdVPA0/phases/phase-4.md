SUPERGOAL_PHASE_START
Phase: 4 of 6 — Wire Processor Specs
Task: Connect processor declarations to the view-system registry and diagnostics.
Type: brownfield, implementation, tests
Mandatory commands: pnpm typecheck; node --experimental-sqlite --import tsx --test tests/processor-view-system.test.ts
Acceptance criteria: 5
Evidence required: processor catalog sample, focused test output, typecheck summary
Depends on phases: 2

## Why

Processors should declare their inputs and outputs in a way the view registry can understand and inspect.

## Work

- Add a helper in `packages/processor-runtime` or `packages/view-system` that builds a processor catalog/report.
- Include processor id, consumed observations, consumed views, produced views, runtime kind, speed, autonomy, and privacy policy.
- Check produced views against registered specs and return warnings for unregistered outputs.
- Add focused tests covering `createSurfaceStateProcessor()`.
- Add declaration scenario tests for writing ambient, YouTube learning, memory profile update, and browser automation processors.

## Acceptance criteria (all must pass — verify each in transcript)

- Processor catalog/report includes processor id, consumed observations, consumed views, produced views, runtime kind, speed, autonomy, and privacy policy.
- Produced view types are checked against registered specs and unregistered outputs are reported as warnings, not fatal errors.
- `processor.surface_state` appears in the report and maps to `state.surface`.
- The integration imports no browser UI, Chrome extension, or server package code.
- Processor declaration scenario tests cover writing ambient, YouTube learning, memory profile update, and browser automation declarations without requiring live LLM calls.

## Mandatory commands (run each, surface last ~10 lines + exit code)

- `pnpm typecheck`
- `node --experimental-sqlite --import tsx --test tests/processor-view-system.test.ts`

## Evidence required in transcript

- Print processor catalog/report sample.
- Print focused test output.
- Print typecheck exit code and last lines.

## Notes

Do not change processor execution semantics unless required. This phase is about inspectability and registry linkage.

---

The agent will, during execution, print SUPERGOAL_PHASE_START (above),
do the work, then print SUPERGOAL_PHASE_VERIFY, MEMORY_SAVED, and
SUPERGOAL_PHASE_DONE in order. On failure, the agent follows the
3-strike recovery protocol in .supergoal/info-view-first-proactive-agent-os-archi-mdVPA0/PROTOCOL.md without further
instruction needed here.
