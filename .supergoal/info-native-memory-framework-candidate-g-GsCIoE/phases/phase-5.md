SUPERGOAL_PHASE_START
Phase: 5 of 6 — Expose Memory CLI
Task: Add `mf memory` commands for candidates, durable memories, trace, reject, and promote.
Mandatory commands:
- pnpm typecheck
- node --experimental-sqlite --import tsx --test tests/mf-memory-cli.test.ts
- pnpm mf memory candidates
- pnpm mf memory list
Acceptance criteria: 6
Evidence required:
- CLI smoke output
- CLI tests
- Typecheck summary
Depends on phases: 1, 2, 3, 4

## Work

Expose the memory framework to users and agents through the existing `mf` CLI.

Expected implementation direction:

- Extend `scripts/mf.ts`.
- Keep existing `view` and `processor` commands unchanged.
- Add clear non-zero exits for bad input.
- For reject/promote commands, write review signals or run the gate rather than deleting source evidence.

## Acceptance Criteria

- [ ] `pnpm mf memory list` lists durable memory views grouped by kind/type.
- [ ] `pnpm mf memory candidates` lists active `memory.candidate` views with confidence and proposed target.
- [ ] `pnpm mf memory trace <id>` prints provenance, gate status, source records/views, and durable target if promoted.
- [ ] `pnpm mf memory reject <id>` records a review/rejection signal without deleting source evidence.
- [ ] `pnpm mf memory promote <id>` can explicitly promote a candidate when policy allows.
- [ ] Missing/unknown arguments return non-zero with helpful errors.

## Mandatory commands

- `pnpm typecheck`
- `node --experimental-sqlite --import tsx --test tests/mf-memory-cli.test.ts`
- `pnpm mf memory candidates`
- `pnpm mf memory list`

## Evidence required

- CLI smoke output.
- CLI tests.
- Typecheck summary.

[Agent will print SUPERGOAL_PHASE_VERIFY and SUPERGOAL_PHASE_DONE here during execution]
