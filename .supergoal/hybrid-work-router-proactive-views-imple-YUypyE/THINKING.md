# Thinking: Hybrid Work Router Proactive Views

## Goals

- Implement the discussed hybrid context architecture: realtime deterministic feature/rule routing plus scheduled AI/hybrid consolidation.
- Keep `state.surface` on the realtime path; do not force current-surface state through scheduled AI.
- Introduce a durable `work.focus_set` view as the intermediate layer before `project.current`.
- Make `project.current` a real generated view for coding/project work, with AI session growth and local project evidence as high-confidence inputs.
- Improve CLI/diagnostics so agents can inspect view specs, latest views, traces, processors, and router output.

## Constraints

- Core owns protocols, not closed categories. No new closed `ScopeKind` enum.
- Project and memory remain view families, not kernel objects.
- Rules output structured features, rule hits, scores, and evidence fields, not natural-language reasons.
- LLM use must be batch/on-demand only for semantic consolidation; realtime processing should be deterministic and cheap.
- Existing work-thread, ai-session, local-project, and surface-state code should be reused instead of replaced.

## Risks

1. **Duplicating the existing work-thread pipeline** — mitigation: build route candidates and focus set on top of existing feature extraction and candidate-thread ideas where possible.
2. **Token/cost creep** — mitigation: realtime route candidate processor is local only; batch router defaults to deterministic consolidation and accepts optional LLM later.
3. **View pollution** — mitigation: `project.current` updates only from high-confidence project lanes in `work.focus_set`, not every browser/screen observation.

## Dependencies

- Phase 1 route candidate types and processor are required before scheduled routing.
- Phase 2 `work.focus_set` must exist before `project.current` can be safely generated.
- CLI enhancements should come after views/processors exist, otherwise they have no meaningful target.
- Runtime wiring and tests depend on the processors being exported and registered.

## Open Questions Assumed

- The first implementation should be deterministic/hybrid-ready rather than requiring a real LLM provider.
- Scheduled AI batch router can expose an LLM option but must pass tests without external network/model calls.
- `observation.ai_session_locator_result` is the real AI coding session source for now; raw `observation.codex.message` can remain a future direct feed.
- `.supergoal` planning artifacts are acceptable to keep in the working tree for this run.

## Memory Hits Applied

- Hybrid retrieval/routing should combine rules, metadata, time, and semantic consolidation rather than pure vector or pure LLM.
- Ambient speed tiers matter: `reflex` for rule processors, `think/background` for scheduled consolidation.
- Agent coding workflows need project/session/file/git evidence preserved for project views.

## Tools/Skills Relied On

- `supergoal` for phase planning and execution protocol.
- `repo-first-principles` style recon through code reads and repository structure.
- Shell, `rg`, `sed`, `pnpm`, and TypeScript tests.

## Best Practices Applied

- Keep deterministic logic testable with structured rule hits.
- Preserve provenance via `source_records` and `source_views`.
- Make new capabilities inspectable through `ViewSpec`, `ProcessorDefinition`, and CLI output.
- Verify with focused unit tests, typecheck, CLI smoke tests, and final full test suite.
