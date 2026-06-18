# End-to-End Dogfood Scenarios

GitHub issue: https://github.com/junjiezhou1122/Metaflow/issues/12

## Problem

Unit and integration tests are strong, but the system needs realistic end-to-end dogfood scenarios that prove observation, routing, memory, browser UX, and proactive behavior work together.

## Scope

- Build scenario fixtures and/or scripts for representative workflows.
- Cover coding with browser research, interruptions, YouTube learning, selection toolbar, writing feedback, and memory review.
- Store artifacts/logs for regression debugging.

## Acceptance Criteria

- [ ] Scenario: user codes with Codex while browsing docs and project views update correctly.
- [ ] Scenario: unrelated message/weather interruption does not pollute project memory.
- [ ] Scenario: YouTube caption/pause creates learning fragments and review queue.
- [ ] Scenario: selection explain/translate writes expected observations/views.
- [ ] Scenario: writing suggestion dismiss/insert/edit affects feedback/memory.
- [ ] Scenario: memory candidate promote/reject works from CLI or UI.
- [ ] Scenario artifacts include logs, stored Views, and verification summaries.

## Verification

- Add tests/scripts, suggested: `tests/e2e-dogfood-scenarios.test.ts` or `scripts/dogfood-*`.
- Required commands:
  - `pnpm typecheck`
  - `pnpm test`
  - scenario-specific smoke command documented in this criteria file.

## PR Done When

- A future regression can run the scenarios and see what broke from saved artifacts.
