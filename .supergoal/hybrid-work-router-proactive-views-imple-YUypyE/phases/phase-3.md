SUPERGOAL_PHASE_START
Phase: 3 of 6 — Generate Project Current
Task: Implement real project.current generation from high-confidence work lanes.
Type: brownfield, architecture, feature
Mandatory commands: pnpm typecheck; node --experimental-sqlite --import tsx --test tests/project-current-view.test.ts
Acceptance criteria: 6
Evidence required: project current test output; example project.current JSON; typecheck summary
Depends on phases: 2

## Why

`project.current` should be a real view, but only after routing determines which project lanes are active.

## Work

- Add a compiler module such as `packages/views/project/current.ts`.
- Register or expose a processor/view compiler for `project.current`.
- Build project views from `work.focus_set` project lanes plus supporting observations.
- Extract pragmatic fields from evidence: focus, files, sessions, decisions, questions, next actions.
- Add tests in `tests/project-current-view.test.ts`.

## Acceptance criteria (all must pass — verify each in transcript)

- A compiler/processor writes `project.current` views from `work.focus_set` project lanes.
- Output includes `focus`, `recent_context`, `decisions`, `open_questions`, `next_actions`, `active_files`, `active_sessions`, and `supporting_sources`.
- AI session and local project/git evidence is weighted above generic browser/screen observations.
- Unrelated browser pages/messages do not enter project evidence unless routed by a relevant lane.
- Multiple active project lanes can produce multiple `project.current` views.
- Existing `work_thread` behavior remains compatible or is bridged/documented.

## Mandatory commands (run each, surface last ~10 lines + exit code)

- `pnpm typecheck`
- `node --experimental-sqlite --import tsx --test tests/project-current-view.test.ts`

## Evidence required in transcript

- Test output for single-project, multi-project, and unrelated-interruption scenarios.
- Example `project.current` JSON showing supporting sources and next actions.
- The `pnpm typecheck` result.

## Notes

- Keep summaries conservative. Deterministic extraction may produce candidate decisions/questions rather than pretending to know more than evidence supports.
- Do not add a kernel `Project` object.

---

The agent will, during execution, print SUPERGOAL_PHASE_START (above),
do the work, then print SUPERGOAL_PHASE_VERIFY, MEMORY_SAVED, and
SUPERGOAL_PHASE_DONE in order. On failure, the agent follows the
3-strike recovery protocol in .supergoal/hybrid-work-router-proactive-views-imple-YUypyE/PROTOCOL.md without further
instruction needed here.
