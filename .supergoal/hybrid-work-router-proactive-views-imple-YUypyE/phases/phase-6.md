SUPERGOAL_PHASE_START
Phase: 6 of 6 — Polish & Harden
Task: Verify the hybrid router architecture end to end and harden edge cases.
Type: brownfield, hardening, verification
Mandatory commands: git diff --check; pnpm typecheck; pnpm test; pnpm mf view list; pnpm mf processor list; pnpm mf processor report
Acceptance criteria: 8
Evidence required: final command summaries; final diff stat; architecture summary
Depends on phases: 1, 2, 3, 4, 5

## Why

The system should end in a coherent, tested state with realtime and scheduled paths clearly separated.

## Work

- Add missing edge-case tests discovered during implementation.
- Review docs and ViewSpecs for naming consistency.
- Confirm no realtime path calls LLM runtimes or requires external API keys.
- Confirm privacy-sensitive records are not promoted into durable views.
- Run full regression commands.
- Produce final diff/stat and architecture summary.

## Acceptance criteria (all must pass — verify each in transcript)

- Realtime route candidate and surface processors do not call LLM runtimes or require external API keys.
- Empty/noisy inputs produce stable empty/low-confidence outputs instead of throwing.
- Privacy `do_not_store` or secret records are not promoted into durable project/memory views.
- Full `pnpm typecheck` passes.
- Full `pnpm test` passes.
- `pnpm mf view list`, `pnpm mf processor list`, and `pnpm mf processor report` pass.
- `git diff --check` passes.
- Documentation and ViewSpecs agree on view names, processor ids, and flow.

## Mandatory commands (run each, surface last ~10 lines + exit code)

- `git diff --check`
- `pnpm typecheck`
- `pnpm test`
- `pnpm mf view list`
- `pnpm mf processor list`
- `pnpm mf processor report`

## Evidence required in transcript

- Final command summaries with exit codes.
- Final `git diff --stat`.
- Short final architecture summary showing realtime vs scheduled paths.

## Notes

- Use the codex background command guard for long full-test runs if the execution session risks hanging.
- Do not commit or push unless explicitly asked during/after the run.

---

The agent will, during execution, print SUPERGOAL_PHASE_START (above),
do the work, then print SUPERGOAL_PHASE_VERIFY, MEMORY_SAVED, and
SUPERGOAL_PHASE_DONE in order. On failure, the agent follows the
3-strike recovery protocol in .supergoal/hybrid-work-router-proactive-views-imple-YUypyE/PROTOCOL.md without further
instruction needed here.
