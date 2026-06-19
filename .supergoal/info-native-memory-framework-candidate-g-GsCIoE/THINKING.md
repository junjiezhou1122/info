# Thinking: Info-Native Memory Framework

## Goals

- Treat memory as one subsystem inside the existing Observation -> View -> Program/Policy -> Agent Runtime architecture.
- Keep Info's View-first model as the source of truth: every memory must be a View with provenance, privacy, validity, confidence, and reversibility metadata.
- Add a stable path from raw observations and existing views into memory candidates, then through a gate into durable memory views.
- Make EverOS-style memory possible through a backend adapter boundary, without replacing Info's ContextStore or View registry.

## Constraints

- Do not replace existing `ContextStore`, `ContextView`, ProgramRuntime, or ViewSpec registry.
- Do not call external LLMs in deterministic candidate/gate tests.
- Do not store secret or `do_not_store` source material in durable memory.
- Keep existing feedback learning and language/project memory behavior compatible.
- Current working tree already contains the hybrid work router changes; this run builds on that shape.

## Risks

1. **Memory pollution** — writing every weak signal into long-term memory would reduce retrieval quality.
   - Mitigation: route everything through `memory.candidate` first, then gate by evidence count, confidence, privacy, and conflict checks.
2. **Parallel memory systems** — existing `memory.surfacing_preference`, `memory.output_edit_pattern`, `memory.language.*`, and `memory.project.patterns` could diverge from new memories.
   - Mitigation: add compatibility mapping and tests; do not delete existing views in this run.
3. **Privacy regression** — candidate/gate logic could accidentally promote private secrets into durable memories.
   - Mitigation: first-class privacy checks in candidate processors, gate, durable writer, and tests.

## Dependencies

- ViewSpec additions should land before processors so registry/reporting can validate outputs.
- Candidate processors must exist before the gate can be tested.
- Gate and durable memory writer must land before CLI mutation commands such as reject/promote.
- Runtime wiring depends on processor definitions and view compilers.

## Architecture Decision

Memory is not the kernel. Memory is a View family with policy:

```text
Observation / Existing Views
        |
        v
memory.candidate
        |
        v
processor.memory_gate
        |
        +--> memory.preferences
        +--> memory.workflow_patterns
        +--> memory.skill_gaps
        +--> memory.agent_collaboration_style
        +--> project.memory
        +--> agent.case_memory
```

The gate writes durable memories only when source evidence is allowed and strong enough. Every durable memory keeps:

- `source_records` / `source_views`
- `memory_kind`
- `claim`
- `evidence_count`
- `confidence`
- `last_confirmed_at`
- `supersedes` / `superseded_by` where applicable
- `user_rejected` / rejection provenance where applicable

## EverOS Boundary

EverOS is useful as a reference and possible backend. This run should define an adapter interface and a no-op/local backend shape, but not require an EverOS dependency or daemon.

```ts
interface MemoryBackend {
  writeMemory(view: ContextView): Promise<void>;
  searchMemory(query: MemoryQuery): Promise<MemoryResult[]>;
  updateMemory(id: string, patch: MemoryPatch): Promise<void>;
  traceMemory(id: string): Promise<MemoryTrace>;
}
```

## Best Practices Applied

- Candidate-first memory avoids premature long-term storage.
- Gate-first promotion keeps repeated evidence and user feedback stronger than single observations.
- Durable memories remain ordinary Views so Context Pack, surfacing, CLI, provenance, and feedback keep working.
- CLI inspection is part of the feature, not an afterthought.

