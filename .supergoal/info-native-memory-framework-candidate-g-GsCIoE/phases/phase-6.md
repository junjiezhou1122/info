SUPERGOAL_PHASE_START
Phase: 6 of 6 — Polish & Harden
Task: Harden memory framework privacy, idempotency, compatibility, docs, and full regression.
Mandatory commands:
- git diff --check
- pnpm typecheck
- pnpm test
- pnpm mf view list
- pnpm mf processor list
- pnpm mf processor report
- pnpm mf memory candidates
- pnpm mf memory list
Acceptance criteria: 9
Evidence required:
- Final command summaries with exit codes
- Final `git diff --stat`
- Short final architecture summary
Depends on phases: 1, 2, 3, 4, 5

## Work

Run the final hardening pass. Memory is high-risk because bad memories can pollute future agents.

Expected implementation direction:

- Add missing edge tests discovered during implementation.
- Update docs:
  - `docs/view-first-proactive-agent-os.md`
  - `docs/info-ambient-runtime-architecture.md`
  - package README where relevant
- Confirm no LLM/API dependency in deterministic candidate/gate paths.
- Confirm repeated runtime ticks are idempotent.

## Acceptance Criteria

- [ ] Candidate and gate processors do not call LLM runtimes or require external API keys.
- [ ] Repeated runtime ticks do not create duplicate durable memories for the same evidence.
- [ ] Secret and `do_not_store` source material is never promoted into durable memory.
- [ ] Existing memory views remain queryable and compatible.
- [ ] Docs explain memory as a subsystem and the optional EverOS adapter boundary.
- [ ] Full `pnpm typecheck` passes.
- [ ] Full `pnpm test` passes.
- [ ] `pnpm mf view list`, `pnpm mf processor list`, `pnpm mf processor report`, and memory CLI commands all run successfully.
- [ ] `git diff --check` passes.

## Mandatory commands

- `git diff --check`
- `pnpm typecheck`
- `pnpm test`
- `pnpm mf view list`
- `pnpm mf processor list`
- `pnpm mf processor report`
- `pnpm mf memory candidates`
- `pnpm mf memory list`

## Evidence required

- Final command summaries with exit codes.
- Final `git diff --stat`.
- Short final architecture summary.

[Agent will print SUPERGOAL_PHASE_VERIFY and SUPERGOAL_PHASE_DONE here during execution]
