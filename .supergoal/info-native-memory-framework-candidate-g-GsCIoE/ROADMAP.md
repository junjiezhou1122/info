# Roadmap: Info-Native Memory Framework

**Task:** Implement a View-first memory framework that turns observations and existing views into memory candidates, gates them into durable memory views, exposes memory inspection/feedback through CLI, and leaves an adapter boundary for EverOS-style backends without replacing Info's core architecture.
**Type:** brownfield, architecture, feature, refactor
**Created:** 2026-06-16
**Total phases:** 6

## Context Summary

- **Stack:** TypeScript monorepo on Node, pnpm, SQLite-backed `@info/core`, ViewSpec registry, ProgramRuntime, processor runtime, runtime tick, Chrome ACP/browser sensors.
- **Package manager:** pnpm
- **Build / test commands:** `pnpm typecheck`, `pnpm test`, targeted `node --experimental-sqlite --import tsx --test ...`, `pnpm mf ...`
- **Notable existing memory surfaces:** `memory.surfacing_preference`, `memory.output_edit_pattern`, `memory.language.*`, `memory.project.patterns`, declared `memory.preferences`, `memory.workflow_patterns`, `memory.skill_gaps`, `memory.agent_collaboration_style`, and `project.memory`.
- **Risky areas:** memory pollution, privacy leaks, duplicate memory systems, runtime/CLI registration.

## Assumptions

- Memory remains a subsystem of Info's View graph, not a replacement runtime.
- First implementation is deterministic and testable without external LLM credentials.
- EverOS is treated as an optional backend/interface target, not a mandatory dependency in this run.
- Existing memory-producing programs remain compatible; this run adds a unifying candidate/gate path rather than deleting legacy memory views.
- Durable memories require provenance and privacy checks.

## Risk Top 3

1. **Weak signals become noisy long-term memory** — likelihood: high, mitigation: candidate-first design plus gate thresholds and rejection path.
2. **Privacy regression from durable promotion** — likelihood: medium, mitigation: secret/do_not_store filters at candidate, gate, and durable write boundaries.
3. **Existing memory views diverge from new memory framework** — likelihood: medium, mitigation: compatibility mapping, registry diagnostics, and tests that old memory views remain readable.

## Phase Map

| # | Phase | Depends on | Deliverable |
|---|-------|------------|-------------|
| 1 | Define Memory Contracts | — | ViewSpecs, memory framework types, backend adapter boundary |
| 2 | Build Candidate Processors | 1 | Deterministic processors that create `memory.candidate` from feedback, project, and agent/session signals |
| 3 | Build Memory Gate | 1,2 | Gate compiler that promotes/merges/rejects candidates into durable memory views |
| 4 | Wire Runtime Flow | 1,2,3 | View processor/runtime worker integration and context/retrieval compatibility |
| 5 | Expose Memory CLI | 1,2,3,4 | `mf memory` inspection and review commands |
| 6 | Polish & Harden | 1..5 | Privacy, idempotency, compatibility, docs, full verification |

---

## Phase 1 — Define Memory Contracts

**Why:** A memory framework needs stable contracts before processors can write candidates or durable memories.

**Deliverables:**
- ViewSpecs for `memory.candidate`, `agent.case_memory`, and updated durable memory specs where needed
- Memory framework types/module for candidates, gate decisions, durable memory kinds, and backend adapter interface
- Documentation update explaining Info-native memory vs optional EverOS adapter

**Acceptance criteria:**
- [ ] `memory.candidate` is registered as a ViewSpec with lifecycle `session` and clear provenance requirements.
- [ ] Durable memory families include or preserve `memory.preferences`, `memory.workflow_patterns`, `memory.skill_gaps`, `memory.agent_collaboration_style`, `project.memory`, and add `agent.case_memory`.
- [ ] A typed memory framework module defines candidate kinds, gate decisions, durable memory targets, and `MemoryBackend`.
- [ ] The adapter boundary does not import or require EverOS packages.
- [ ] `pnpm mf view list` includes new/updated memory view families.
- [ ] Existing view registry tests still pass.

**Mandatory commands:**
- `pnpm typecheck`
- `node --experimental-sqlite --import tsx --test tests/view-system.test.ts tests/view-system-scenarios.test.ts`
- `pnpm mf view list`

**Evidence required:**
- CLI output showing `memory.candidate` and `agent.case_memory`.
- Typecheck summary.
- Test output.

**Dependencies:** none

---

## Phase 2 — Build Candidate Processors

**Why:** Memory should first become reviewable candidates instead of directly polluting long-term views.

**Deliverables:**
- Candidate compiler/processor module, likely under `packages/views/memory/`
- Candidate extraction from feedback observations, `project.current`, `work.focus_set`, and AI session/local project observations
- Focused candidate tests

**Acceptance criteria:**
- [ ] Feedback observations such as dismissed/useful/edited output can produce `memory.candidate` views with structured `memory_kind`, `claim`, `confidence`, and evidence.
- [ ] `project.current` can produce project memory candidates without copying secret source text.
- [ ] Agent/session or Codex-style observations can produce agent collaboration/workflow candidates when signals are explicit enough.
- [ ] Candidate output includes `source_records` or `source_views`, `evidence_count`, `proposed_scope`, and `promotion_policy`.
- [ ] Secret or `do_not_store` sources produce no candidates.
- [ ] Empty/noisy inputs produce no candidates and do not throw.

**Mandatory commands:**
- `pnpm typecheck`
- `node --experimental-sqlite --import tsx --test tests/memory-candidate.test.ts`

**Evidence required:**
- Test output.
- Example `memory.candidate` JSON with provenance and no copied secret payload.

**Dependencies:** phase 1

---

## Phase 3 — Build Memory Gate

**Why:** Candidate quality depends on a gate that decides promote, merge, reject, or hold.

**Deliverables:**
- Memory gate compiler/processor
- Durable memory writer helpers
- Tests for promote/merge/reject/privacy/conflict behavior

**Acceptance criteria:**
- [ ] Gate promotes high-confidence candidates into the correct durable memory view type.
- [ ] Gate holds low-confidence or single weak candidates as candidates without promotion.
- [ ] Gate merges compatible repeated candidates instead of creating duplicates.
- [ ] Gate can reject candidates from explicit negative feedback and records rejection provenance.
- [ ] Gate refuses promotion if any source record/view violates privacy policy.
- [ ] Durable memories include traceable evidence, confidence, last confirmation, and reversibility metadata.

**Mandatory commands:**
- `pnpm typecheck`
- `node --experimental-sqlite --import tsx --test tests/memory-gate.test.ts`

**Evidence required:**
- Test output for promote, merge, reject, and privacy cases.
- Example durable memory JSON.

**Dependencies:** phases 1, 2

---

## Phase 4 — Wire Runtime Flow

**Why:** The memory framework must run through the same processor/runtime surfaces as the rest of Info.

**Deliverables:**
- View processor definitions for memory candidate and gate processors
- Worker/runtime catalog updates
- Runtime tick integration or scheduled/on-demand trigger path
- Compatibility with context pack/retrieval of existing memory views

**Acceptance criteria:**
- [ ] Worker catalog lists memory candidate and memory gate processors with correct speed/autonomy policy.
- [ ] Runtime/view processor flow can generate candidates and durable memories from seeded observations/views in tests.
- [ ] Existing feedback-learning, routing-learning, language-learning, and project ambient tests remain compatible.
- [ ] Context pack and view subscription APIs can retrieve new memory view families without special-case schema changes.
- [ ] Dry-run mode does not persist memory candidates or durable memories.
- [ ] `pnpm mf processor report` has no warnings for built-in processors introduced by this run.

**Mandatory commands:**
- `pnpm typecheck`
- `node --experimental-sqlite --import tsx --test tests/processor-view-system.test.ts tests/runtime-tick.test.ts tests/program-runtime.test.ts`
- `pnpm mf processor report`

**Evidence required:**
- Processor report output.
- Integration test output.
- Dry-run assertion output.

**Dependencies:** phases 1, 2, 3

---

## Phase 5 — Expose Memory CLI

**Why:** Users and agents need to inspect, trace, accept, reject, and debug memory candidates.

**Deliverables:**
- Extended `scripts/mf.ts` with `memory` commands
- CLI tests
- Usage docs

**Acceptance criteria:**
- [ ] `pnpm mf memory list` lists durable memory views grouped by kind/type.
- [ ] `pnpm mf memory candidates` lists active `memory.candidate` views with confidence and proposed target.
- [ ] `pnpm mf memory trace <id>` prints provenance, gate status, source records/views, and durable target if promoted.
- [ ] `pnpm mf memory reject <id>` records a review/rejection signal without deleting source evidence.
- [ ] `pnpm mf memory promote <id>` can explicitly promote a candidate when policy allows.
- [ ] Missing/unknown arguments return non-zero with helpful errors.

**Mandatory commands:**
- `pnpm typecheck`
- `node --experimental-sqlite --import tsx --test tests/mf-memory-cli.test.ts`
- `pnpm mf memory candidates`
- `pnpm mf memory list`

**Evidence required:**
- CLI smoke output.
- CLI tests.
- Typecheck summary.

**Dependencies:** phases 1, 2, 3, 4

---

## Phase 6 — Polish & Harden

**Why:** Memory systems are high leverage and high risk; the final state must be privacy-safe, idempotent, documented, and regression-tested.

**Deliverables:**
- Edge-case tests for idempotency, malformed input, stale candidates, privacy, and compatibility
- Architecture docs updated
- Full regression verification

**Acceptance criteria:**
- [ ] Candidate and gate processors do not call LLM runtimes or require external API keys.
- [ ] Repeated runtime ticks do not create duplicate durable memories for the same evidence.
- [ ] Secret and `do_not_store` source material is never promoted into durable memory.
- [ ] Existing memory views remain queryable and compatible.
- [ ] Docs explain memory as a subsystem and the optional EverOS adapter boundary.
- [ ] Full `pnpm typecheck` passes.
- [ ] Full `pnpm test` passes.
- [ ] `pnpm mf view list`, `pnpm mf processor list`, `pnpm mf processor report`, and memory CLI commands all run successfully.
- [ ] `git diff --check` passes.

**Mandatory commands:**
- `git diff --check`
- `pnpm typecheck`
- `pnpm test`
- `pnpm mf view list`
- `pnpm mf processor list`
- `pnpm mf processor report`
- `pnpm mf memory candidates`
- `pnpm mf memory list`

**Evidence required:**
- Final command summaries with exit codes.
- Final `git diff --stat`.
- Short final architecture summary.

**Dependencies:** phases 1, 2, 3, 4, 5

