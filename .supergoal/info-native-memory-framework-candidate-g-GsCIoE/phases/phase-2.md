SUPERGOAL_PHASE_START
Phase: 2 of 6 — Build Candidate Processors
Task: Create deterministic `memory.candidate` views from feedback, project, and agent/session signals.
Mandatory commands:
- pnpm typecheck
- node --experimental-sqlite --import tsx --test tests/memory-candidate.test.ts
Acceptance criteria: 6
Evidence required:
- Test output
- Example `memory.candidate` JSON with provenance and no copied secret payload
Depends on phases: 1

## Work

Build candidate generation without external LLM requirements. Candidates are reviewable intermediate Views, not long-term memory.

Expected implementation direction:

- Add compiler/processor code under `packages/views/memory/`.
- Generate candidates from:
  - `feedback.analysis.dismissed`
  - `feedback.analysis.useful`
  - `feedback.output.edited`
  - `project.current`
  - `work.focus_set`
  - explicit Codex/Claude/session style observations when available
- Avoid copying large source content into candidates. Store claims and evidence ids.

## Acceptance Criteria

- [ ] Feedback observations such as dismissed/useful/edited output can produce `memory.candidate` views with structured `memory_kind`, `claim`, `confidence`, and evidence.
- [ ] `project.current` can produce project memory candidates without copying secret source text.
- [ ] Agent/session or Codex-style observations can produce agent collaboration/workflow candidates when signals are explicit enough.
- [ ] Candidate output includes `source_records` or `source_views`, `evidence_count`, `proposed_scope`, and `promotion_policy`.
- [ ] Secret or `do_not_store` sources produce no candidates.
- [ ] Empty/noisy inputs produce no candidates and do not throw.

## Mandatory commands

- `pnpm typecheck`
- `node --experimental-sqlite --import tsx --test tests/memory-candidate.test.ts`

## Evidence required

- Test output.
- Example `memory.candidate` JSON with provenance and no copied secret payload.

[Agent will print SUPERGOAL_PHASE_VERIFY and SUPERGOAL_PHASE_DONE here during execution]
