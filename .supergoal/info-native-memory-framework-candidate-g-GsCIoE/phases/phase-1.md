SUPERGOAL_PHASE_START
Phase: 1 of 6 — Define Memory Contracts
Task: Add Info-native memory contracts, ViewSpecs, and backend adapter boundary.
Mandatory commands:
- pnpm typecheck
- node --experimental-sqlite --import tsx --test tests/view-system.test.ts tests/view-system-scenarios.test.ts
- pnpm mf view list
Acceptance criteria: 6
Evidence required:
- CLI output showing `memory.candidate` and `agent.case_memory`
- Typecheck summary
- Test output
Depends on phases: none

## Work

Define the contracts that every later memory phase will use. Memory must remain a View family in Info, not a replacement subsystem.

Expected implementation direction:

- Add or update ViewSpecs in `packages/view-system/builtins.ts`.
- Add a memory framework module under `packages/views/memory/` or a closely related package boundary.
- Define typed concepts for:
  - memory candidate kind
  - durable target view type
  - gate decision
  - promotion policy
  - memory backend adapter
- Keep EverOS as an optional adapter target only. Do not add external EverOS dependencies.

## Acceptance Criteria

- [ ] `memory.candidate` is registered as a ViewSpec with lifecycle `session` and clear provenance requirements.
- [ ] Durable memory families include or preserve `memory.preferences`, `memory.workflow_patterns`, `memory.skill_gaps`, `memory.agent_collaboration_style`, `project.memory`, and add `agent.case_memory`.
- [ ] A typed memory framework module defines candidate kinds, gate decisions, durable memory targets, and `MemoryBackend`.
- [ ] The adapter boundary does not import or require EverOS packages.
- [ ] `pnpm mf view list` includes new/updated memory view families.
- [ ] Existing view registry tests still pass.

## Mandatory commands

- `pnpm typecheck`
- `node --experimental-sqlite --import tsx --test tests/view-system.test.ts tests/view-system-scenarios.test.ts`
- `pnpm mf view list`

## Evidence required

- CLI output showing `memory.candidate` and `agent.case_memory`.
- Typecheck summary.
- Test output.

[Agent will print SUPERGOAL_PHASE_VERIFY and SUPERGOAL_PHASE_DONE here during execution]
