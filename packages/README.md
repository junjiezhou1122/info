# Packages

`packages/` holds the backend as a pnpm workspace of `@info/*` packages.
Application surfaces live in `apps/`. Dependencies flow strictly downward -
each package may only depend on packages below it.

## Dependency layers (top depends on bottom)

```text
apps/{ui,browser-extension}   Application surfaces — HTTP only, no code imports
        |
@info/server      HTTP API (port 3111) + iii worker
@info/runtime     periodic tick orchestrator
@info/programs    user-value loops: ProgramRuntime, registry, built-in programs
        |              |
@info/views   ---> @info/sensors      view compilers / Observation sources
@info/capabilities                    reusable agent-execution power (zero coupling)
@info/processor-runtime                open ProcessorDefinition runtime + diagnostics
@info/view-system                      open ViewSpec registry/query layer
        |
@info/core        kernel: types, schema, store (Context Graph), llm, env,
                  view lifecycle/query/surfacing, policy-aware broker, plugins
```

## Packages

- `core/` — the leaf kernel. Domain types, the SQLite-backed `ContextStore`
  (Context Graph), Zod schemas, LLM access, view lifecycle/query/surfacing, the
  policy-aware broker, and the plugin registry. Depends on nothing intra-repo.
- `sensors/` — Observation sources: Screenpipe, browser enrichment, local
  project snapshots, AI session location. Depends on `@info/core`.
- `views/` — View compilers and shared helpers, plus the `timeline/`,
  `threads/`, `work-router/`, `project/`, and `pipeline/` compiler clusters.
  Includes `work.focus_set`, `project.current`, and the Info-native memory
  framework (`memory.candidate`, candidate extraction, memory gate, durable
  memory helpers, and the backend adapter boundary). Depends on `@info/core`
  (and `@info/sensors` for the visual-frame compiler).
- `view-system/` — the open ViewSpec registry/query layer used by CLI and
  processor diagnostics. It describes view families without adding closed core
  domain enums. Depends on `@info/core`.
- `capabilities/` — `agent-runtime`: the generic AgentTask execution boundary
  (ACP stdio, Claude-Code CLI-JSON, mock, MCP providers). Zero runtime coupling.
  Current implementation lives under `packages/capabilities/agent-runtime/`.
- `processor-runtime/` — the open ProcessorDefinition runtime, including
  consumes/produces declarations, view-system diagnostics, and realtime
  processors such as `state.surface` and `observation.route_candidate`.
  Depends on `@info/core` and `@info/view-system`.
- `programs/` — the ProgramRuntime engine, program/capability registry, signal
  builders, and built-in programs. Depends on `@info/core`, `@info/capabilities`.
- `runtime/` — the periodic tick: pulls sensors, runs view compilers, processes
  ambient/background tasks; hosts feedback, triggers, view-provenance.
- `server/` — the HTTP API surface and the iii worker.

## Rules

- Each package declares its `@info/*` dependencies in its own `package.json`;
  the root `package.json` lists every `@info/*` package as `workspace:*` so
  `tests/` and `scripts/` resolve bare specifiers. tsx resolves package names
  to `.ts` sources via each `package.json`'s `exports` field - no build step.
- Import across packages by package name (`@info/core`), never by relative path.
- Never introduce an upward import (a lower layer importing a higher one).
- `apps/` are excluded from the root tsconfig; they build with their own Vite
  configs and talk to the backend only over HTTP.
