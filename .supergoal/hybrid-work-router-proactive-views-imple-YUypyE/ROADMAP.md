# Roadmap: Hybrid Work Router Proactive Views

**Task:** Implement the hybrid realtime-rule plus scheduled-batch router architecture so observations become route candidates, work focus lanes, and project views.
**Type:** brownfield, architecture, feature, refactor
**Created:** 2026-06-16
**Total phases:** 6

## Context Summary

- **Stack:** TypeScript monorepo on Node with pnpm, SQLite-backed `@info/core`, view processors, processor runtime, runtime tick, and Chrome ACP/browser sensors.
- **Package manager:** pnpm
- **Build / test commands:** `pnpm typecheck`, `pnpm test`, targeted `node --experimental-sqlite --import tsx --test ...`, `pnpm mf ...`
- **Risky areas:** processor/runtime registration, view provenance, existing work-thread overlap, long test runtime.

## Assumptions

- Use deterministic realtime processors for route candidates; no LLM calls in the realtime path.
- Implement scheduled batch routing with deterministic consolidation first and an optional LLM-ready interface, so tests do not require external credentials.
- `state.surface` remains a realtime processor output and does not depend on scheduled AI batch routing.
- `project.current` should be generated only from high-confidence project lanes in `work.focus_set`.
- Reuse existing `ai-sessions`, `local-project`, `work-thread`, and correlation utilities where practical.

## Risk Top 3

1. **Accidentally building a second work-thread system** — likelihood: medium, mitigation: align route candidates with existing correlation features and document the relationship.
2. **Polluting project views with unrelated browser/messages** — likelihood: high, mitigation: add `work.focus_set` as the gate and test interruptions/weather/messages are excluded or demoted.
3. **Breaking runtime/CLI compatibility** — likelihood: medium, mitigation: add focused tests for registry/report/CLI and run full typecheck/test audit.

## Phase Map

| # | Phase | Depends on | Deliverable |
|---|-------|------------|-------------|
| 1 | Build Route Candidates | — | Deterministic route candidate processor and `observation.route_candidate` records |
| 2 | Build Focus Set | 1 | Scheduled/batch `work.focus_set` compiler from route candidates and recent observations |
| 3 | Generate Project Current | 2 | Real `project.current` processor/compiler gated by high-confidence project lanes |
| 4 | Expose Agent CLI | 1,2,3 | `mf processor list/report`, `mf view latest`, and `mf view trace` commands |
| 5 | Wire Runtime | 1,2,3,4 | Runtime/view-system registration, docs, and trigger/tick integration for the new flow |
| 6 | Polish & Harden | 1..5 | Full verification, edge tests, docs consistency, and regression sweep |

---

## Phase 1 — Build Route Candidates

**Why:** Realtime observation routing needs a cheap deterministic layer that extracts features and candidate routes without spending LLM tokens.

**Deliverables:**
- `packages/processor-runtime/builtins/route-candidate.ts`
- Exports from `packages/processor-runtime/index.ts`
- Documented `observation.route_candidate` record contract
- Focused route candidate tests

**Acceptance criteria:**
- [ ] A local processor with id `processor.route_candidate` consumes relevant `observation.*` records and produces structured `observation.route_candidate` records.
- [ ] Rule output contains `features`, `candidate_routes`, `rule_hits`, `evidence_fields`, and numeric scores, with no natural-language `reason` field in candidate routes.
- [ ] Rules cover at least AI session/local project, git/file path, browser domain/title, communication app, and recency/active project hints.
- [ ] Route candidates preserve source provenance through `relations.derived_from` or `source_records`.
- [ ] Unit tests cover Codex/Claude AI session metadata, browser docs page, unrelated browser page, and message/communication interruption.

**Mandatory commands:**
- `pnpm typecheck`
- `node --experimental-sqlite --import tsx --test tests/processor-route-candidate.test.ts`

**Evidence required:**
- Test output showing route candidate tests pass.
- Example JSON route candidate with `rule_hits` and without `reason`.
- Typecheck summary.

**Dependencies:** none

---

## Phase 2 — Build Focus Set

**Why:** Real users work across several lanes, so the system needs a `work.focus_set` view before updating project-specific state.

**Deliverables:**
- `packages/views/work-router/focus-set.ts` or equivalent compiler module
- `work.focus_set` ViewSpec in `packages/view-system/builtins.ts`
- Tests for multi-lane grouping and interruption demotion

**Acceptance criteria:**
- [ ] A compiler/processor generates `work.focus_set` from recent route candidates and recent observations.
- [ ] Output contains `active_lanes`, `attention_share`, `lane_key`, `lane_kind`, `source_records`, `candidate_route_ids`, and confidence.
- [ ] The compiler supports multiple simultaneous project/topic/communication lanes instead of a single current project.
- [ ] Related browser research can attach to an active project lane when candidate scores/evidence support it.
- [ ] Unrelated interruptions are represented as low-attention lanes or excluded from project lanes.
- [ ] The implementation works without external LLM credentials and exposes an LLM-ready hook/options shape for later semantic consolidation.

**Mandatory commands:**
- `pnpm typecheck`
- `node --experimental-sqlite --import tsx --test tests/work-focus-set.test.ts`

**Evidence required:**
- Test output showing multi-project and interruption scenarios pass.
- Printed example `work.focus_set` content with at least two lanes.
- Typecheck summary.

**Dependencies:** phase 1

---

## Phase 3 — Generate Project Current

**Why:** `project.current` must become a real generated view, but only after work lanes determine which project context is actually active.

**Deliverables:**
- `packages/views/project/current.ts` or equivalent compiler
- Processor/view-worker registration for `project.current`
- Tests proving `project.current` is generated from high-confidence project lanes

**Acceptance criteria:**
- [ ] A real compiler/processor writes `project.current` views from `work.focus_set` project lanes and supporting observations.
- [ ] Output includes `focus`, `recent_context`, `decisions`, `open_questions`, `next_actions`, `active_files`, `active_sessions`, and `supporting_sources`.
- [ ] AI session locator records and local project/git evidence have higher weight than generic browser/screen observations.
- [ ] Unrelated browser pages/messages do not appear in `project.current` evidence unless routed through a relevant lane.
- [ ] The compiler creates one project view per high-confidence project lane and supports multiple active projects.
- [ ] Existing legacy `work_thread` behavior remains compatible or is clearly bridged.

**Mandatory commands:**
- `pnpm typecheck`
- `node --experimental-sqlite --import tsx --test tests/project-current-view.test.ts`

**Evidence required:**
- Test output for single-project, multi-project, and unrelated-interruption cases.
- Example `project.current` JSON showing sources and next actions.
- Typecheck summary.

**Dependencies:** phase 2

---

## Phase 4 — Expose Agent CLI

**Why:** Agents and users need simple inspection commands to see all views/processors, latest view state, and provenance traces.

**Deliverables:**
- Extended `scripts/mf.ts`
- Tests or smoke coverage for CLI parser/output
- Updated usage docs

**Acceptance criteria:**
- [ ] `pnpm mf processor list` prints processor ids, runtime kind, consumed observations/views, produced views, and speed/autonomy.
- [ ] `pnpm mf processor report` prints registry diagnostics and warnings for unregistered outputs.
- [ ] `pnpm mf view latest <view_type>` prints the latest active views for that type.
- [ ] `pnpm mf view trace <view_id>` prints source records/source views/compiler/provenance enough for debugging.
- [ ] Existing `pnpm mf view list/show/json/search` behavior remains unchanged.
- [ ] CLI commands return non-zero or helpful errors for missing arguments/unknown IDs.

**Mandatory commands:**
- `pnpm typecheck`
- `node --experimental-sqlite --import tsx --test tests/mf-cli.test.ts`
- `pnpm mf view list`
- `pnpm mf processor list`

**Evidence required:**
- Output snippets from `mf processor list` and `mf view latest work.focus_set`.
- Test output for CLI tests.
- Typecheck summary.

**Dependencies:** phases 1, 2, 3

---

## Phase 5 — Wire Runtime

**Why:** The new architecture must be discoverable and executable through the existing runtime/worker surfaces, not just isolated tests.

**Deliverables:**
- Processor/runtime registry updates
- View processor definitions or runtime tick integration for route candidates, focus set, and project current
- Documentation updates in architecture docs and package README
- Integration tests

**Acceptance criteria:**
- [ ] Worker catalog includes route candidate, focus set, and project current processors/view compilers with correct speed/autonomy policy.
- [ ] Runtime tick or view processor flow can generate `work.focus_set` and `project.current` in dry-run/test mode from seeded observations.
- [ ] `state.surface` remains a separate realtime path and is documented as not requiring scheduled batch AI.
- [ ] `pnpm mf processor report` has no warnings for built-in processors produced by this work.
- [ ] Docs describe the final hybrid flow: realtime surface, realtime route candidates, scheduled focus set, project current downstream.

**Mandatory commands:**
- `pnpm typecheck`
- `node --experimental-sqlite --import tsx --test tests/iii-runtime.test.ts tests/runtime-tick.test.ts tests/processor-view-system.test.ts`
- `pnpm mf processor report`

**Evidence required:**
- Worker/processor catalog output showing new processors.
- Integration test output.
- Doc paths updated.

**Dependencies:** phases 1, 2, 3, 4

---

## Phase 6 — Polish & Harden

**Why:** The previous phases ship behavior; this phase ensures the final state is coherent, tested, documented, and not leaking token-heavy behavior into realtime paths.

**Deliverables:**
- Final docs consistency pass
- Edge-case tests for empty input, low confidence, stale records, privacy/do-not-store, and multi-lane ambiguity
- Full regression verification

**Acceptance criteria:**
- [ ] Realtime route candidate and surface processors do not call LLM runtimes or require external API keys.
- [ ] Empty/noisy inputs produce stable empty/low-confidence views instead of throwing.
- [ ] Privacy `do_not_store` or secret records are not promoted into durable project/memory views.
- [ ] Full `pnpm typecheck` passes.
- [ ] Full `pnpm test` passes.
- [ ] `pnpm mf view list`, `pnpm mf processor list`, and `pnpm mf processor report` all run successfully.
- [ ] `git diff --check` passes.
- [ ] Documentation and ViewSpecs agree on view names, processor ids, and flow.

**Mandatory commands:**
- `git diff --check`
- `pnpm typecheck`
- `pnpm test`
- `pnpm mf view list`
- `pnpm mf processor list`
- `pnpm mf processor report`

**Evidence required:**
- Final command summaries with exit codes.
- Final `git diff --stat`.
- Short final architecture summary showing which path is realtime and which path is scheduled.

**Dependencies:** phases 1, 2, 3, 4, 5
