SUPERGOAL_PHASE_START
Phase: 6 of 6 — Polish & Harden
Task: Verify docs, implementation, tests, migration notes, and diff cleanliness.
Type: brownfield, hardening, documentation, tests
Mandatory commands: pnpm typecheck; pnpm test; git diff --stat
Acceptance criteria: 7
Evidence required: final command summaries, closed ontology grep, final diff stat
Depends on phases: 1, 2, 3, 4, 5

## Why

The architecture and implementation should be internally consistent, testable, and ready for issue/branch execution.

## Work

- Add migration notes explaining legacy `packages/views/catalog.ts` versus new `packages/view-system`.
- Add a scenario matrix to `docs/view-first-proactive-agent-os.md`.
- Update workspace package layering docs.
- Run final typecheck and tests.
- Review the diff for unrelated files, secrets, generated artifacts, and accidental Chrome ACP UI changes.
- Verify the no-closed-ontology rule in the new core package.

## Acceptance criteria (all must pass — verify each in transcript)

- `rg "ScopeKind|type ScopeKind|enum ScopeKind" packages/view-system packages/processor-runtime docs/view-first-proactive-agent-os.md` prints no matches.
- `docs/view-first-proactive-agent-os.md` contains `Adding a New View Family`.
- `docs/view-first-proactive-agent-os.md` contains a scenario test matrix covering project/coding, writing, YouTube learning, web research, personal memory, current surface, and automation.
- `packages/README.md` or equivalent workspace doc mentions `@info/view-system` in the package layering.
- `pnpm typecheck` exits 0.
- `pnpm test` exits 0, or any pre-existing failures are clearly identified with evidence and no new failures are attributable to this run.
- `git diff --stat` is reviewed and contains no generated build artifacts, secrets, or unrelated Chrome ACP UI changes.

## Mandatory commands (run each, surface last ~10 lines + exit code)

- `pnpm typecheck`
- `pnpm test`
- `git diff --stat`

## Evidence required in transcript

- Print final command summaries.
- Print closed-ontology grep result.
- Print final diff stat.

## Notes

For `pnpm test`, use the codex background command guard if the command is expected to run over 30 seconds.

---

The agent will, during execution, print SUPERGOAL_PHASE_START (above),
do the work, then print SUPERGOAL_PHASE_VERIFY, MEMORY_SAVED, and
SUPERGOAL_PHASE_DONE in order. On failure, the agent follows the
3-strike recovery protocol in .supergoal/info-view-first-proactive-agent-os-archi-mdVPA0/PROTOCOL.md without further
instruction needed here.
