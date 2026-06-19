SUPERGOAL_PHASE_START
Phase: 1 of 6 — Build Route Candidates
Task: Implement deterministic realtime route candidate extraction for observations.
Type: brownfield, architecture, feature
Mandatory commands: pnpm typecheck; node --experimental-sqlite --import tsx --test tests/processor-route-candidate.test.ts
Acceptance criteria: 5
Evidence required: route candidate test output; example route candidate JSON; typecheck summary
Depends on phases: none

## Why

Realtime routing needs cheap structured candidates that rules can compute without LLM token cost.

## Work

- Add a built-in local processor, probably `packages/processor-runtime/builtins/route-candidate.ts`, with id `processor.route_candidate`.
- Reuse feature extraction ideas from `packages/views/timeline/correlation.ts` where useful, but keep output suitable for machine routing.
- Output a ContextRecord with schema `observation.route_candidate`; route candidates are observation-derived intermediate records, not View families.
- Export the processor from `packages/processor-runtime/index.ts`.
- Document the `observation.route_candidate` schema contract in architecture docs and tests.
- Add focused tests in `tests/processor-route-candidate.test.ts`.

## Acceptance criteria (all must pass — verify each in transcript)

- A local processor with id `processor.route_candidate` consumes relevant `observation.*` records and produces structured `observation.route_candidate` records.
- Candidate route output contains `features`, `candidate_routes`, `rule_hits`, `evidence_fields`, and numeric scores.
- Candidate routes do not contain a natural-language `reason` field.
- Rules cover AI session/local project, file path/git-like signals, browser domain/title, communication app, and recency/active-project hints.
- Output preserves source provenance through `relations.derived_from` or `source_records`.

## Mandatory commands (run each, surface last ~10 lines + exit code)

- `pnpm typecheck`
- `node --experimental-sqlite --import tsx --test tests/processor-route-candidate.test.ts`

## Evidence required in transcript

- The test summary for `tests/processor-route-candidate.test.ts`.
- One example JSON output from a docs-page or AI-session route candidate showing `rule_hits` and no `reason`.
- The `pnpm typecheck` result.

## Notes

- Do not add a closed domain enum.
- Do not call LLM APIs in this processor.
- Treat communication and unrelated browser activity as low-confidence or non-project candidates.

---

The agent will, during execution, print SUPERGOAL_PHASE_START (above),
do the work, then print SUPERGOAL_PHASE_VERIFY, MEMORY_SAVED, and
SUPERGOAL_PHASE_DONE in order. On failure, the agent follows the
3-strike recovery protocol in .supergoal/hybrid-work-router-proactive-views-imple-YUypyE/PROTOCOL.md without further
instruction needed here.
