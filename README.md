# Metaflow

<p align="center">
  <a href="./README.zh-CN.md">简体中文</a>
</p>

Metaflow is a local-first context runtime for personal AI agents. It turns raw
work traces into typed, inspectable Views that agents and applications can use
as durable working memory.

```text
Observation -> Processor -> ViewGraph -> App / Agent Action -> Feedback -> Evolution
```

![Metaflow architecture](assets/metaflow-architecture.svg)

![Metaflow innovation](assets/metaflow-innovation.jpg)

## Why Metaflow

Most memory systems store history and hope retrieval finds the right chunk
later. Metaflow treats memory as a living graph of task-specific Views:
compressed state, evidence, task context, feedback, results, and long-term
preferences.

The goal is practical: future work should start from organized state instead of
expensive repeated search. A useful View reduces tokens, time, context misses,
and repeated failure.

## What It Does Today

- Captures observations from conversations, browser activity, Screenpipe,
  project files, logs, and runtime events.
- Writes canonical Views such as `state.surface`, `work.focus_set`,
  `project.current`, `task.*`, `result.*`, `feedback.*`, `memory.daily`, and
  `memory.profile`.
- Runs deterministic, LLM, script, and agent-task processors.
- Maintains a ViewGraph with fork, update, archive, delete, trace, and child
  traversal operations.
- Exposes a CLI surface for agents through `pnpm mf`.
- Provides an HTTP runtime and React UI for inspecting Views, processors,
  memory, proactive inboxes, and project state.
- Ships a Chrome ACP surface for reading the active tab, observing elements,
  acting in the browser, and using current-page context.
- Includes adaptive View promotion so repeated work, useful state, and feedback
  can become better processors or better Views.

## Architecture

Metaflow has seven working layers:

| Layer | Role |
| --- | --- |
| Observation stream | Conversations, browser state, Screenpipe evidence, code, logs, failures, and user feedback |
| Task discovery | Finds repeated work, expensive searches, open loops, failures, and reusable methods |
| Processor runtime | Runs deterministic code, LLM prompts, scripts, agent tasks, and browser jobs |
| ViewGraph | Stores typed task-specific Views with provenance and lifecycle state |
| Personal apps | Projects Views into dashboards, learning tools, memory inboxes, and browser surfaces |
| Verification | Measures task success, usefulness, edits, dismissals, latency, and search cost |
| Evolution | Creates, updates, forks, merges, splits, retires, and promotes Views and processors |

Everything important is represented as a View. Current state is a View. A task
is a View. A result is a View. Feedback is a View family. Memory is a retained
View whose job is to change future behavior.

## Repository Layout

```text
apps/
  chrome-acp/          Chrome ACP browser surface
  ui/                  React inspection UI
  mac-companion/       macOS companion app
packages/
  core/                Store, schema, lifecycle, plugin registry, View queries
  server/              HTTP runtime
  processor-runtime/   Processor registry and execution runtimes
  view-system/         Canonical View definitions and built-ins
  views/               View catalogs, timelines, proactive and workflow Views
  runtime/             Ambient runtime loop
  sensors/             Screenpipe and other observation sources
  capabilities/        Agent/runtime capability adapters
docs/                  Architecture, contracts, design notes, and issue docs
criteria/              Acceptance criteria for focused workstreams
scripts/               CLI, runtime, ingest, timeline, and maintenance tools
```

## Quick Start

Requirements:

- Node.js with `--experimental-sqlite` support
- pnpm

Install dependencies:

```bash
pnpm install
```

Start the HTTP runtime:

```bash
pnpm run dev
```

The runtime defaults to:

```text
http://localhost:3111
```

Start the UI:

```bash
pnpm run ui:dev
```

Build the UI:

```bash
pnpm run ui:build
```

Run tests:

```bash
pnpm test
```

Type-check:

```bash
pnpm run typecheck
```

## CLI

`pnpm mf` is the main agent-facing surface.

```bash
pnpm mf --json help
pnpm mf --json state
pnpm mf --json view list
pnpm mf --json view latest project.current
pnpm mf --json view children view:source
pnpm mf --json view fork view:source --id view:task --view-type task.browser_brief --patch ./patch.json
pnpm mf --json view update view:task --status accepted --patch ./patch.json
pnpm mf --json view delete view:task --reason "superseded"
pnpm mf --json processor list
pnpm mf --json processor report
pnpm mf --json processor run processor.view_promotion_engine --record obs:example
pnpm mf --json task list --refresh
pnpm mf --json task queue --limit 8
pnpm mf --json sensor screenpipe status
pnpm mf --json sensor screenpipe search --focused --app Cursor --start "30m ago"
pnpm mf --json memory daily show --date 2026-06-17
pnpm mf --json memory profile show
```

## Core View Families

- `state.surface`: what the user is currently looking at or operating.
- `work.focus_set`: active tasks, windows, projects, and intent.
- `project.current`: the current project state and next useful actions.
- `task.*`: pending, active, delegated, and completed work.
- `result.*`: outputs from tasks and agent actions.
- `feedback.*`: accept, dismiss, edit, correction, and usefulness signals.
- `memory.daily`: one-day retained memory.
- `memory.profile`: durable user preferences, habits, and working patterns.
- `suggestion.*`: proposed actions or context that may help the user.

## Chrome ACP

`apps/chrome-acp/packages/chrome-extension/` is the current browser agent
surface. It lets agents:

- read the active tab,
- observe interactive elements,
- act by intent or selector,
- use current-tab debugger tools when needed,
- query task Views and View state from the side panel.

Load it unpacked from:

```text
apps/chrome-acp/packages/chrome-extension/
```

## Personal Applications

Applications are specialized projections over the same ViewGraph, not separate
memory silos.

- English learning app: language exposure, difficult segments, review queues,
  and learning memory.
- Research app: hypotheses, evidence, methods, failures, timelines, and open
  questions.
- Project command center: `project.current`, project tasks, agent task lists,
  and automation outcomes.
- Memory inbox: memory candidates, daily memory, profile memory, and feedback.
- Browser task cockpit: current page state, browser task Views, Chrome ACP
  results, and action outcomes.
- Workflow miner: traces, repeated task clusters, failures, and successful
  methods.

## Key Docs

- [Adaptive ViewGraph Memory](docs/adaptive-viewgraph-memory.md)
- [View-First Proactive Agent OS](docs/view-first-proactive-agent-os.md)
- [Application Surface Contract](docs/application-surface-contract.md)
- [Evolution Engine](docs/evolution-engine.md)
- [Info Design Consensus](docs/info-design-consensus.md)
- [Agent Surface CLI](docs/agent-surface-cli.md)
- [Ambient Runtime Architecture](docs/info-ambient-runtime-architecture.md)
- [View Implementation Matrix](docs/view-implementation-matrix.md)

## Project Status

Metaflow is an active local-first system with a working CLI, ViewGraph, runtime
processors, memory surfaces, React UI, and Chrome ACP browser agent surface. The
implementation is evolving quickly, but the central contract is stable:

```text
make context inspectable, make memory actionable, and let feedback improve the system
```
