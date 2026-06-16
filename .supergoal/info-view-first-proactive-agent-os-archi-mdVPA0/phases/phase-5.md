SUPERGOAL_PHASE_START
Phase: 5 of 6 — Dogfood Built-ins
Task: Register project and personal memory as built-in view families over the open protocol.
Type: brownfield, implementation, documentation
Mandatory commands: pnpm typecheck; pnpm mf view list; pnpm mf view show project.current; pnpm mf view show memory.preferences
Acceptance criteria: 6
Evidence required: project CLI output, memory CLI output, extension example location, typecheck summary
Depends on phases: 2, 3, 4

## Why

The abstraction must prove itself with the two first useful systems: project context and personal memory.

## Work

- Register built-in specs for `state.surface`, `project.current`, `project.inbox`, `project.memory`, `project.tasks`, `project.decisions`.
- Register built-in specs for `memory.profile`, `memory.preferences`, `memory.workflow_patterns`, `memory.skill_gaps`, `memory.agent_collaboration_style`.
- Ensure specs contain examples and producer guidance.
- Add sample specs for `learning.youtube_fragment`, `writing.advice`, and `research.brief`.
- Add a doc section showing how AI/user can add a new view family without core schema changes.

## Acceptance criteria (all must pass — verify each in transcript)

- Project and personal memory specs are registered as view families, not TypeScript core enums.
- Each built-in spec has purpose, lifecycle/stability, subject guidance, producer guidance, and example content.
- `pnpm mf view list` shows `project.current` and `memory.preferences`.
- `pnpm mf view show project.current` and `pnpm mf view show memory.preferences` work even if no stored views exist.
- The docs include a worked example for adding an arbitrary view family such as `learning.youtube_fragment`.
- Sample specs for `learning.youtube_fragment`, `writing.advice`, and `research.brief` exist and are visible through `pnpm mf view list`.

## Mandatory commands (run each, surface last ~10 lines + exit code)

- `pnpm typecheck`
- `pnpm mf view list`
- `pnpm mf view show project.current`
- `pnpm mf view show memory.preferences`

## Evidence required in transcript

- Print CLI output snippets for project and memory specs.
- Print the worked extension example location.
- Print typecheck exit code and last lines.

## Notes

Do not implement full project/memory processors yet unless tiny and directly required for examples. Specs first.

---

The agent will, during execution, print SUPERGOAL_PHASE_START (above),
do the work, then print SUPERGOAL_PHASE_VERIFY, MEMORY_SAVED, and
SUPERGOAL_PHASE_DONE in order. On failure, the agent follows the
3-strike recovery protocol in .supergoal/info-view-first-proactive-agent-os-archi-mdVPA0/PROTOCOL.md without further
instruction needed here.
