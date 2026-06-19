# Repo map

_Generated 2026-06-16 13:02:28_

## Top-level layout
- apps
- archive
- assets
- CLAUDE.md
- data
- docs
- exp
- How I deleted 95% of my agent skills and got better results — Nick Nisi, WorkOS [vy7o1g2iHY8].en.vtt
- node_modules
- package.json
- packages
- plugins
- pnpm-lock.yaml
- pnpm-workspace.yaml
- README.md
- ref
- scripts
- tests
- tsconfig.json

## Source directories (depth 2)
### `packages/`
- packages/sensors
- packages/sensors/node_modules
- packages/sensors/local-project
- packages/sensors/ai-sessions
- packages/sensors/enrichment
- packages/sensors/screenpipe
- packages/core
- packages/core/node_modules
- packages/core/.omc
- packages/capabilities
- packages/capabilities/node_modules
- packages/capabilities/agent-runtime
- packages/iii-runtime
- packages/iii-runtime/node_modules
- packages/processor-runtime
- packages/processor-runtime/node_modules
- packages/processor-runtime/runtimes
- packages/processor-runtime/builtins
- packages/runtime
- packages/runtime/node_modules
- packages/server
- packages/server/node_modules
- packages/view-system
- packages/programs
- packages/programs/capabilities
- packages/programs/node_modules
- packages/programs/builtins
- packages/views
- packages/views/pipeline
- packages/views/memory

### `apps/`
- apps/ui
- apps/ui/dist
- apps/ui/node_modules
- apps/ui/src
- apps/mac-companion
- apps/mac-companion/.build
- apps/mac-companion/Sources
- apps/mac-companion/build
- apps/browser-extension
- apps/browser-extension/dist
- apps/browser-extension/node_modules
- apps/browser-extension/src
- apps/english-learning
- apps/chrome-acp
- apps/chrome-acp/midscene_run
- apps/chrome-acp/node_modules
- apps/chrome-acp/docs
- apps/chrome-acp/packages

## File counts (top extensions)
- `.ts`: 238 files
- `.tsx`: 79 files
- `.md`: 41 files
- `.json`: 32 files
- `.html`: 11 files
- `.css`: 10 files
- `.js`: 7 files
- `.png`: 5 files
- `.yaml`: 4 files
- `.svg`: 3 files

## Largest source files (top 15 by line count)
- `tests/http-server.test.ts` (6988 lines)
- `tests/program-runtime.test.ts` (4297 lines)
- `.supergoal/info-view-first-proactive-agent-os-archi-mdVPA0/pnpm-test.log` (1567 lines)
- `apps/chrome-acp/packages/chrome-extension/src/content.ts` (1560 lines)
- `apps/ui/src/main.tsx` (1513 lines)
- `apps/chrome-acp/packages/shared/src/components/ai-elements/prompt-input.tsx` (1462 lines)
- `tests/context-broker.test.ts` (1379 lines)
- `packages/core/store.ts` (1315 lines)
- `apps/chrome-acp/packages/shared/src/components/ChatInterface.tsx` (1284 lines)
- `packages/runtime/runtime.ts` (1129 lines)
- `apps/chrome-acp/packages/chrome-extension/src/tools/browser.ts` (1114 lines)
- `packages/server/http-server.ts` (1108 lines)
- `apps/chrome-acp/packages/proxy-server/src/server.ts` (1092 lines)
- `packages/views/_shared/memory-views.ts` (987 lines)
- `apps/browser-extension/content.js` (967 lines)

## Test surface
- Directories named `test`: 52
- Directories named `tests`: 16
- Directories named `__tests__`: 6
- Directories named `spec`: 1
- Directories named `specs`: 1
- Test files (by name pattern): 448

## Notable config / infra
- `pnpm-workspace.yaml`
- `tsconfig.json`

## Recent activity (last 10 commits)
- `4812645` 2026-06-16 Add view-first proactive agent architecture
- `9f4c7bf` 2026-06-13 Add Chrome ACP current page policy
- `b8bb275` 2026-06-13 Add current-page Chrome ACP tools
- `6f1c5fc` 2026-06-12 Prefer Chrome ACP browser tools over vision fallback
- `9143446` 2026-06-12 Fix Chrome ACP side panel React dependency resolution
- `2e2a912` 2026-06-12 Fix Chrome ACP side panel blank state
- `c3f7a24` 2026-06-12 Add Chrome ACP browser automation and processor runtime
- `3cb7975` 2026-06-11 Migrate ambient browser flows into Chrome ACP
- `f905886` 2026-06-10 Phase 12: auto-inject active tab context into every side panel prompt
- `df28613` 2026-06-10 Phase 11: pin chrome-acp sessions to a .metaflow workspace cwd

## Files churned in last 20 commits (top 10)
- `pnpm-lock.yaml` (9×)
- `package.json` (9×)
- `tests/package-scripts.test.ts` (7×)
- `tests/browser-extension-agent-task.test.ts` (4×)
- `pnpm-workspace.yaml` (4×)
- `packages/server/http-server.ts` (4×)
- `apps/chrome-acp/packages/shared/src/components/ChatInterface.tsx` (4×)
- `apps/chrome-acp/packages/shared/src/components/ACPMain.tsx` (4×)
- `apps/chrome-acp/packages/proxy-server/src/mcp/types.ts` (4×)
- `apps/chrome-acp/packages/proxy-server/src/mcp/handler.ts` (4×)

_End repo map._
