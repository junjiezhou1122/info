# Packages

`packages/` contains reusable boundaries that can evolve independently from the
main HTTP/runtime application in `src/`.

- `adapters/` — runtime adapters for external systems. `adapters/agent-runtime`
  is the generic AgentTask runtime boundary used by `capability.agent_task.submit`.
- `connectors/` — source acquisition and normalization packages, such as
  Screenpipe, browser enrichment, local project snapshots, and AI session
  location.
- `views/` — reusable View compilers and shared View helpers.
- `browser-extension/` — Chrome MV3 browser sensor and View reader surface.
- `ui/` — Vite/React runtime UI. It has its own `tsconfig.json` and build
  script, so the root runtime typecheck does not compile the browser app.
- `evaluators/` — reserved for future evaluation packages.

The top-level `packages/index.ts` re-exports package namespaces for package
consumers. `src/` may keep thin compatibility shims for older imports, but new
cross-boundary code should import from `packages/` directly.

Package code should stay reusable and host-light:

- Packages may import stable substrate types/store utilities from `src/core`.
- Packages should not import `src/server`, `src/runtime`, `src/programs`, or
  `src/broker`.
- Source-specific acquisition stays in `connectors/`; derived representations
  stay in `views/`; external runtime/protocol execution stays in `adapters/`.
- Generated outputs such as `ui/dist/` and local dependencies such as
  `ui/node_modules/` are local build artifacts, not package source.
