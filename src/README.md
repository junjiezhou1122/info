# Source Layout

`src/` is the host application layer: HTTP server, runtime orchestration,
program registry, local storage, and persistence. Reusable connector, View,
browser-extension, UI, and adapter implementations live under `packages/`.

- `core/` — stable substrate types, schemas, SQLite store, env, LLM client.
- `runtime/` — host runtime tick, workspace resolver, candidate thread
  correlation, timelines, feedback, triggers, and provenance utilities.
- `threads/` — WorkThread evidence maps, display interpreter, split/merge ops.
- `broker/` — ContextBroker / ContextPack assembly for plugins and agents.
- `plugins/` — plugin registry and built-in plugin compilers.
- `programs/` — Program runtime, built-in Programs, and host capability
  registration.
- `server/` — standalone HTTP server and iii worker entrypoints.

Keep raw observations in `core` types/store. Put source-specific acquisition in
`packages/connectors`, reusable derived representations in `packages/views`, and
agent/runtime integration in `packages/adapters`. Keep `src/runtime`,
`src/programs`, `src/broker`, and `src/server` focused on host orchestration.

Boundary rule of thumb:

- `src/core` defines the stable data substrate that packages may import.
- `src/server`, `src/runtime`, `src/programs`, and `src/broker` wire the local
  application together and may import package implementations.
- New connector acquisition code belongs in `packages/connectors`.
- New reusable View compilers belong in `packages/views`.
- New external agent or protocol execution belongs in `packages/adapters`.
- Browser extension and runtime UI code stay under their package directories,
  with root scripts delegating to those package build/runtime boundaries.

The old package-backed `src/connectors/*` and selected `src/runtime/*` re-export
shims have been archived. New code should import package implementations from
`packages/` directly.

## Runtime event log and timeline views

- `runtime_events` is an append-only provenance log for system behavior: ingestion, plugin runs, broker queries, view compilers, runtime ticks, and thread interpretation.
- `timeline.observations` is a derived `ContextView` over raw `ContextRecord` observations. It buckets recent records by time and preserves `source_records` links.

Useful commands:

```bash
pnpm run runtime:events -- --limit 50
pnpm run timeline -- --minutes 1440 --limit 100 --dry-run
pnpm run timeline -- --minutes 1440 --limit 100
```

Broker can also include provenance events when needed:

```bash
pnpm run context:query -- --events --no-records --no-views --event-types timeline_view_compiled,plugin_run_completed --limit 10
```

Daemon can maintain the timeline automatically:

```bash
pnpm run daemon -- --timeline --timeline-interval 300 --timeline-minutes 1440 --timeline-limit 200
```
