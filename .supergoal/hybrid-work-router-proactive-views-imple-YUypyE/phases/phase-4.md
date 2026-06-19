SUPERGOAL_PHASE_START
Phase: 4 of 6 — Expose Agent CLI
Task: Add mf processor and view inspection commands for agent operability.
Type: brownfield, cli, feature
Mandatory commands: pnpm typecheck; node --experimental-sqlite --import tsx --test tests/mf-cli.test.ts; pnpm mf view list; pnpm mf processor list
Acceptance criteria: 6
Evidence required: CLI test output; processor list snippet; view latest snippet; typecheck summary
Depends on phases: 1, 2, 3

## Why

Agents need simple commands to inspect available processors, latest views, and provenance traces.

## Work

- Extend `scripts/mf.ts` with `processor list`, `processor report`, `view latest <view_type>`, and `view trace <view_id>`.
- Use existing `buildProcessorViewReport` where appropriate.
- Ensure existing `view list/show/json/search` commands keep working.
- Add tests, likely `tests/mf-cli.test.ts`, using child process execution with temp `CONTEXT_DB_PATH` when needed.
- Update docs or README usage snippets.

## Acceptance criteria (all must pass — verify each in transcript)

- `pnpm mf processor list` prints processor ids, runtime kind, consumes, produces, speed, and autonomy.
- `pnpm mf processor report` prints diagnostics and unregistered output warnings.
- `pnpm mf view latest <view_type>` prints latest active views for that type.
- `pnpm mf view trace <view_id>` prints compiler, source records, source views, and provenance fields.
- Existing `pnpm mf view list/show/json/search` behavior remains available.
- Missing args or unknown IDs produce helpful errors and non-zero exit where appropriate.

## Mandatory commands (run each, surface last ~10 lines + exit code)

- `pnpm typecheck`
- `node --experimental-sqlite --import tsx --test tests/mf-cli.test.ts`
- `pnpm mf view list`
- `pnpm mf processor list`

## Evidence required in transcript

- Output snippet from `pnpm mf processor list`.
- Output snippet from `pnpm mf view latest work.focus_set` or a controlled test equivalent.
- The CLI test and typecheck results.

## Notes

- Keep output compact and script-friendly.
- Avoid requiring a populated production database for tests.

---

The agent will, during execution, print SUPERGOAL_PHASE_START (above),
do the work, then print SUPERGOAL_PHASE_VERIFY, MEMORY_SAVED, and
SUPERGOAL_PHASE_DONE in order. On failure, the agent follows the
3-strike recovery protocol in .supergoal/hybrid-work-router-proactive-views-imple-YUypyE/PROTOCOL.md without further
instruction needed here.
