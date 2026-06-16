# Thinking: View-First Proactive Agent OS

## Goal

Turn the current Info architecture into a clear, extensible View-first / Processor-first system where new derived intelligence can be added without editing core domain enums. The first concrete deliverable is an architecture doctrine plus a minimal `view-system` substrate and CLI that makes current and future view families easy to list, inspect, validate, and extend.

## Constraints

- Existing `ContextView` and `ContextStore` are already flexible enough; do not rewrite storage in this run.
- `packages/views` contains useful legacy compilers and catalog code, but the catalog is currently closed and domain-heavy. Treat it as reference, not the future kernel.
- `packages/processor-runtime` already has a promising `ProcessorDefinition` model with `consumes`, `produces`, runtime config, and speed/autonomy policy.
- User explicitly rejected closed object ontologies such as `ScopeKind = project | task | topic | ...`.
- Project is an important built-in view family for dogfooding, not a kernel object.

## Architecture Decision

Core owns protocols, not categories.

Stable kernel:

```text
Observation
Processor
View
View Registry
Processor Registry
View Graph / provenance
Feedback / outcome
```

Open upper layers:

```text
project.*
memory.*
learning.*
writing.*
research.*
workflow.*
automation.*
```

These are view families registered in the system. They are not hardcoded as enums in the core.

## Top Risks

1. **Over-abstracting before use**  
   Mitigation: implement only protocol metadata, registry, query helpers, and two dogfood families (`project.*`, `memory.*`).

2. **Creating a second incompatible view system**  
   Mitigation: build on `ContextView`, do not change database schema, and provide adapters around existing `packages/views/catalog.ts`.

3. **CLI becomes another one-off script**  
   Mitigation: put registry/query logic in `packages/view-system`; make `scripts/mf.ts` a thin client.

## Non-Obvious Dependencies

- The architecture doctrine must be written first because later code names encode the model.
- Registry must exist before CLI and before processor integration.
- Processor runtime integration should depend on registry specs, not import old view catalog directly.
- Project/memory examples should be examples of open family registration, not new core categories.

## Best Practices Applied

- Event-sourced / CQRS shape: observations are facts, views are derived read models.
- Open world model: view types are namespaced strings, not closed enums.
- Plugin architecture: extensions register specs and processors rather than editing central switch statements.
- Provenance-first memory: long-term memory is a view with stronger retention rules, not raw logs.

## Self-Critique

- Falsifiability: clean. Phase criteria are command-, file-, grep-, import-, or CLI-output based.
- Phase atomicity: acceptable. Phase 2 is the largest phase, but it is one coherent unit: shared `@info/view-system` substrate plus focused tests.
- Weakest dependency: Phase 2. If the ViewSpec API is wrong, Phase 3 CLI, Phase 4 processor diagnostics, and Phase 5 built-ins inherit the mistake. Mitigation: Phase 2 acceptance explicitly tests dynamic arbitrary view registration and forbids closed ontology.

## Assumptions

- This Supergoal run should prepare an executable chain, not directly start source edits without user review.
- The first execution branch can modify docs, add `packages/view-system`, add `scripts/mf.ts`, and add focused tests.
- Full `pnpm test` may be long; use the background command guard in execution phases.
