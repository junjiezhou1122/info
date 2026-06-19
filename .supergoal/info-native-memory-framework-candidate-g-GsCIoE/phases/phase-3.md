SUPERGOAL_PHASE_START
Phase: 3 of 6 — Build Memory Gate
Task: Promote, merge, hold, or reject memory candidates with provenance and privacy checks.
Mandatory commands:
- pnpm typecheck
- node --experimental-sqlite --import tsx --test tests/memory-gate.test.ts
Acceptance criteria: 6
Evidence required:
- Test output for promote, merge, reject, and privacy cases
- Example durable memory JSON
Depends on phases: 1, 2

## Work

Implement the gate that prevents noisy candidates from becoming durable memory. The gate should be deterministic for this phase.

Expected implementation direction:

- Add `compileMemoryGate` or equivalent.
- Promote high-confidence candidates to target durable View types.
- Hold weak candidates.
- Merge repeated compatible candidates into existing durable memory.
- Reject candidates from explicit rejection/review signals.
- Always validate source privacy before promotion.

## Acceptance Criteria

- [ ] Gate promotes high-confidence candidates into the correct durable memory view type.
- [ ] Gate holds low-confidence or single weak candidates as candidates without promotion.
- [ ] Gate merges compatible repeated candidates instead of creating duplicates.
- [ ] Gate can reject candidates from explicit negative feedback and records rejection provenance.
- [ ] Gate refuses promotion if any source record/view violates privacy policy.
- [ ] Durable memories include traceable evidence, confidence, last confirmation, and reversibility metadata.

## Mandatory commands

- `pnpm typecheck`
- `node --experimental-sqlite --import tsx --test tests/memory-gate.test.ts`

## Evidence required

- Test output for promote, merge, reject, and privacy cases.
- Example durable memory JSON.

[Agent will print SUPERGOAL_PHASE_VERIFY and SUPERGOAL_PHASE_DONE here during execution]
