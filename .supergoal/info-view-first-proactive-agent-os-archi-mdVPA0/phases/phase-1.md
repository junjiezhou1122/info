SUPERGOAL_PHASE_START
Phase: 1 of 6 — Lock Architecture Doctrine
Task: Establish the canonical View-first / Processor-first architecture doctrine for Info.
Type: brownfield, architecture, documentation
Mandatory commands: pnpm typecheck
Acceptance criteria: 5
Evidence required: architecture invariant excerpt, old-doc reference grep, typecheck summary
Depends on phases: none

## Why

The code needs one explicit doctrine before more packages and view families are added.

## Work

- Create `docs/view-first-proactive-agent-os.md`.
- Define the stable kernel as Observation, Processor, View, ViewSpec, ProcessorSpec, ViewGraph, Feedback, and Memory.
- Explicitly state that core owns protocols, not categories.
- Explain that Project and Personal Memory are built-in view families, not kernel objects.
- Update existing high-level docs to point to the new doctrine and reduce conflicting Program-centric wording.

## Acceptance criteria (all must pass — verify each in transcript)

- `docs/view-first-proactive-agent-os.md` exists.
- The new doc contains the exact invariant `Core owns protocols, not categories`.
- The new doc contains `Observation -> Processor -> View -> Processor/Agent/UI -> Feedback -> Memory`.
- The new doc says Project and Personal Memory are built-in view families, not kernel objects.
- `rg "view-first-proactive-agent-os" docs/info-design-consensus.md docs/info-ambient-runtime-architecture.md` prints at least one reference.

## Mandatory commands (run each, surface last ~10 lines + exit code)

- `pnpm typecheck`

## Evidence required in transcript

- Print the architecture invariant section from the new doc.
- Print the `rg` output proving existing docs reference the doctrine.
- Print the typecheck exit code and last lines.

## Notes

Do not rewrite the entire docs directory. Keep edits focused on resolving the new doctrine and linking existing docs to it.

---

The agent will, during execution, print SUPERGOAL_PHASE_START (above),
do the work, then print SUPERGOAL_PHASE_VERIFY, MEMORY_SAVED, and
SUPERGOAL_PHASE_DONE in order. On failure, the agent follows the
3-strike recovery protocol in .supergoal/info-view-first-proactive-agent-os-archi-mdVPA0/PROTOCOL.md without further
instruction needed here.
