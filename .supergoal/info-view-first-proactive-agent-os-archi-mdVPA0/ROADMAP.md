# Roadmap: Info View-First Proactive Agent OS

**Task:** Design and implement the first durable architecture slice for a View-first / Processor-first Info proactive agent OS.
**Type:** brownfield, architecture, refactor, tooling
**Created:** 2026-06-15
**Total phases:** 6

## Context Summary

- **Stack:** TypeScript NodeNext monorepo with pnpm workspaces.
- **Package manager:** pnpm.
- **Build / test / lint commands:** `pnpm typecheck`, `pnpm test`.
- **Risky areas:** existing `packages/views` legacy catalog, new `packages/processor-runtime`, large test suite, open architecture naming.

## Assumptions

- Core should not define closed domain enums such as `ScopeKind`.
- `ContextView` remains the storage shape for now; this run adds protocol/spec layers, not a database rewrite.
- Project and Personal Memory become built-in view families, not kernel objects.
- The first dogfood target is the `info` repo, but the design must work for non-programmer domains later.
- `mf view ...` should be a thin CLI over shared view-system APIs, not a standalone script with duplicated logic.

## Risk Top 3

1. **Closed ontology sneaks back in** — likelihood: medium, mitigation: acceptance criteria forbid core enums for project/topic/course/person kinds.
2. **New package duplicates existing view code** — likelihood: medium, mitigation: adapters reference `ContextView` and legacy catalog without replacing store or compilers.
3. **Full tests are slow or flaky** — likelihood: medium, mitigation: run focused tests per phase and use guarded full tests in the hardening phase.

## Phase Map

| # | Phase | Depends on | Deliverable |
|---|-------|------------|-------------|
| 1 | Lock Architecture Doctrine | none | A canonical design doc that resolves View/Processor/core/domain boundaries |
| 2 | Create View System | 1 | `packages/view-system` with open ViewSpec registry and tests |
| 3 | Add MF View CLI | 2 | `scripts/mf.ts` and package script for listing/showing/querying views |
| 4 | Wire Processor Specs | 2 | Processor registry/runtime can expose consumes/produces against view specs |
| 5 | Dogfood Built-ins | 2, 3, 4 | Project and personal memory registered as built-in view families, not core objects |
| 6 | Polish & Harden | 1, 2, 3, 4, 5 | Scenario matrix, docs, tests, migration notes, and final audit all clean |

---

## Phase 1 — Lock Architecture Doctrine

**Why:** The code needs one explicit doctrine before more packages and view families are added.

**Deliverables:**
- `docs/view-first-proactive-agent-os.md`
- Updates to `docs/info-design-consensus.md` and/or `docs/info-ambient-runtime-architecture.md` that point to the new doctrine instead of conflicting with it.

**Acceptance criteria:**
- [ ] The new doc states that core owns protocols, not categories.
- [ ] The new doc defines Observation, Processor, View, ViewSpec, ProcessorSpec, ViewGraph, Feedback, and Memory without requiring closed domain enums.
- [ ] The doc explains Project and Personal Memory as built-in view families, not kernel objects.
- [ ] The doc includes the concrete data flow: `Observation -> Processor -> View -> Processor/Agent/UI -> Feedback -> Memory`.
- [ ] Existing high-level docs link to the new doctrine and no longer imply Program/Project is the only core path.

**Mandatory commands:**
- `pnpm typecheck`

**Evidence required:**
- Print the architecture invariant section from the new doc.
- Print `rg` results showing old docs reference the doctrine.
- Print the typecheck exit code and last lines.

**Dependencies:** none

---

## Phase 2 — Create View System

**Why:** New view families must be registered and queried without editing a closed catalog.

**Deliverables:**
- `packages/view-system/package.json`
- `packages/view-system/index.ts`
- `packages/view-system/spec.ts`
- `packages/view-system/registry.ts`
- `packages/view-system/query.ts`
- `packages/view-system/builtins.ts`
- Workspace and root dependency updates.
- Focused tests for registry/query behavior.

**Acceptance criteria:**
- [ ] `ViewSpec` supports open `view_type`, open `subject` metadata, lifecycle/stability, purpose, schema hint, examples, default query, and producer ownership.
- [ ] Registry APIs can register many specs, list by namespace/family, fetch by exact view type, and merge legacy catalog entries.
- [ ] Query helpers can filter stored `ContextView` records by `view_type`, prefix, labels, subject, stability, and status without requiring closed categories.
- [ ] No new core domain enum for project/task/topic/course/person/browser_tab/etc is introduced.
- [ ] Focused tests cover dynamic registration of a new arbitrary view family such as `youtube.caption_fragment`.
- [ ] Scenario tests cover project/coding, writing, YouTube learning, web research, personal memory, current surface, and automation view families without core schema changes.

**Mandatory commands:**
- `pnpm typecheck`
- `node --experimental-sqlite --import tsx --test tests/view-system.test.ts`
- `node --experimental-sqlite --import tsx --test tests/view-system-scenarios.test.ts`

**Evidence required:**
- Print exported API names from `packages/view-system/index.ts`.
- Print focused test output.
- Print typecheck exit code and last lines.

**Dependencies:** Phase 1

---

## Phase 3 — Add MF View CLI

**Why:** Users and agents need a simple operational surface: list, inspect, and query views.

**Deliverables:**
- `scripts/mf.ts`
- Root package script `"mf": "node --experimental-sqlite --import tsx scripts/mf.ts"`
- Tests or smoke checks for CLI output.

**Acceptance criteria:**
- [ ] `pnpm mf view list` prints registered view specs with view type, lifecycle, producer, and purpose.
- [ ] `pnpm mf view show <view_type>` prints the spec and latest stored views when present.
- [ ] `pnpm mf view json <view_type>` prints machine-readable JSON.
- [ ] `pnpm mf view search <query>` searches specs and stored view summaries.
- [ ] CLI uses `@info/view-system` APIs rather than duplicating registry logic.

**Mandatory commands:**
- `pnpm typecheck`
- `pnpm mf view list`
- `pnpm mf view show state.surface`

**Evidence required:**
- Print sample output for `view list`.
- Print sample output for `view show state.surface`.
- Print typecheck exit code and last lines.

**Dependencies:** Phase 2

---

## Phase 4 — Wire Processor Specs

**Why:** Processors should declare their inputs and outputs in a way the view registry can understand and inspect.

**Deliverables:**
- Processor-runtime integration helper that maps `ProcessorDefinition.consumes/produces` to view-system specs.
- Registry report or diagnostic API for processors.
- Tests covering at least `processor.surface_state`.

**Acceptance criteria:**
- [ ] Processor runtime can produce a catalog/report listing processor id, consumed observations, consumed views, produced views, runtime kind, speed, autonomy, and privacy policy.
- [ ] Produced view types are checked against registered specs and unregistered outputs are reported as warnings, not fatal errors.
- [ ] `processor.surface_state` appears in the report and maps to `state.surface`.
- [ ] The integration does not import browser UI or server code.
- [ ] Processor declaration scenario tests cover writing ambient, YouTube learning, memory profile update, and browser automation declarations without live LLM calls.

**Mandatory commands:**
- `pnpm typecheck`
- `node --experimental-sqlite --import tsx --test tests/processor-view-system.test.ts`

**Evidence required:**
- Print processor catalog/report sample.
- Print focused test output.
- Print typecheck exit code and last lines.

**Dependencies:** Phase 2

---

## Phase 5 — Dogfood Built-ins

**Why:** The abstraction must prove itself with the two first useful systems: project context and personal memory.

**Deliverables:**
- Built-in ViewSpecs for `state.surface`, `project.current`, `project.inbox`, `project.memory`, `project.tasks`, `project.decisions`.
- Built-in ViewSpecs for `memory.profile`, `memory.preferences`, `memory.workflow_patterns`, `memory.skill_gaps`, `memory.agent_collaboration_style`.
- A short doc section showing how AI/user can add a new view family without core schema changes.

**Acceptance criteria:**
- [ ] Project and personal memory specs are registered as view families, not TypeScript core enums.
- [ ] Each built-in spec has purpose, lifecycle/stability, subject guidance, producer guidance, and example content.
- [ ] `pnpm mf view list` shows these built-ins.
- [ ] `pnpm mf view show project.current` and `pnpm mf view show memory.preferences` work even if no stored views exist.
- [ ] The doc includes a worked example for adding `learning.youtube_fragment` or equivalent arbitrary new view.
- [ ] Sample specs for `learning.youtube_fragment`, `writing.advice`, and `research.brief` exist to prove the system is not project-only.

**Mandatory commands:**
- `pnpm typecheck`
- `pnpm mf view list`
- `pnpm mf view show project.current`
- `pnpm mf view show memory.preferences`

**Evidence required:**
- Print CLI output snippets for project and memory specs.
- Print the worked extension example location.
- Print typecheck exit code and last lines.

**Dependencies:** Phases 2, 3, 4

---

## Phase 6 — Polish & Harden

**Why:** The architecture and implementation should be internally consistent, testable, and ready for issue/branch execution.

**Deliverables:**
- Final doc cleanup and cross-links.
- Migration notes explaining legacy `packages/views/catalog.ts` versus new `packages/view-system`.
- Full test/typecheck verification.
- Final diff review.

**Acceptance criteria:**
- [ ] `rg "ScopeKind|project/task/topic/course/person" packages/view-system packages/processor-runtime docs/view-first-proactive-agent-os.md` does not reveal a closed ontology in core code.
- [ ] `docs/view-first-proactive-agent-os.md` contains an explicit "Adding a new View Family" section.
- [ ] `docs/view-first-proactive-agent-os.md` contains a scenario test matrix covering project/coding, writing, YouTube learning, web research, personal memory, current surface, and automation.
- [ ] `packages/README.md` or equivalent workspace doc mentions `@info/view-system` in the package layering.
- [ ] `pnpm typecheck` exits 0.
- [ ] `pnpm test` exits 0 or any pre-existing failures are clearly identified with evidence.
- [ ] `git diff --stat` is reviewed and contains no generated build artifacts, secrets, or unrelated Chrome ACP UI changes.

**Mandatory commands:**
- `pnpm typecheck`
- `pnpm test`
- `git diff --stat`

**Evidence required:**
- Print final command summaries.
- Print closed-ontology grep result.
- Print final diff stat.

**Dependencies:** Phases 1, 2, 3, 4, 5
