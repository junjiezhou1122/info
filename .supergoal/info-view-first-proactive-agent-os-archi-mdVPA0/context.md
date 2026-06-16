# Stack context

_Generated 2026-06-15 20:20:35_

## Language signals
- **Node/JS/TS** — package.json present
  - Name: `personal-context-layer`, version: `0.0.1`
  - Top dependencies: @agentclientprotocol/claude-agent-acp, @agentclientprotocol/sdk, @info/capabilities, @info/core, @info/iii-runtime, @info/processor-runtime, @info/programs, @info/runtime, @info/sensors, @info/server, @info/views, @types/node, acpx, browser-image-compression, bun-plugin-tailwind

## Package manager
- **pnpm** (pnpm-lock.yaml)

## Likely commands
From package.json scripts:
- `dev` → `node --experimental-sqlite --import tsx packages/server/http-server.ts`
- `iii:worker` → `node --experimental-sqlite --import tsx packages/server/worker.ts`
- `test:ingest` → `node --experimental-sqlite --import tsx scripts/ingest-example.ts`
- `test:pack` → `node --experimental-sqlite --import tsx scripts/pack-example.ts`
- `test:pack:v2` → `node --experimental-sqlite --import tsx scripts/pack-v2-example.ts`
- `correlate:recent` → `node --experimental-sqlite --import tsx scripts/correlate-recent.ts`
- `ai-session:locate` → `node --experimental-sqlite --import tsx scripts/ai-session-locate.ts`
- `thread` → `node --experimental-sqlite --import tsx scripts/thread.ts`
- `episode:summary` → `node --experimental-sqlite --import tsx scripts/episode-summary.ts`
- `typecheck` → `tsc --noEmit`
- `local-project:once` → `node --experimental-sqlite --import tsx scripts/local-project-once.ts`
- `screenshot:once` → `node --experimental-sqlite --import tsx scripts/screenshot-once.ts`
- `agent-discovery:example` → `node --experimental-sqlite --import tsx scripts/agent-discovery-example.ts`
- `screenpipe:recent` → `node --experimental-sqlite --import tsx scripts/screenpipe-recent.ts`
- `tweet-save:example` → `node --experimental-sqlite --import tsx scripts/tweet-save-example.ts`
- `http` → `node --experimental-sqlite --import tsx packages/server/http-server.ts`
- `runtime:tick` → `node --experimental-sqlite --import tsx scripts/runtime-tick.ts`
- `daemon` → `node --experimental-sqlite --import tsx scripts/daemon.ts`
- `background-tasks` → `node --experimental-sqlite --import tsx scripts/runtime-tick.ts --no-screenpipe --no-ai-sessions --no-git --no-compile-views --background-tasks`
- `toolsmith-artifacts` → `node --experimental-sqlite --import tsx scripts/runtime-tick.ts --no-screenpipe --no-ai-sessions --no-git --no-compile-views --toolsmith-artifacts`
- `runtime:status` → `node --experimental-sqlite --import tsx scripts/runtime-status.ts`
- `thread:interpret` → `node --experimental-sqlite --import tsx scripts/thread-interpret.ts`
- `context:query` → `node --experimental-sqlite --import tsx scripts/context-query.ts`
- `plugin:language` → `node --experimental-sqlite --import tsx scripts/plugin-language.ts`
- `program` → `node --experimental-sqlite --import tsx scripts/program-runtime.ts`

## Git
- Branch: `main`
- Remote: https://github.com/junjiezhou1122/info.git
- Working tree: 1 files changed

## Test / lint heuristics
- Has script: `typecheck`
- Has script: `test`
- Has script: `dev`
- TypeScript present (tsconfig.json)

_End stack context._
