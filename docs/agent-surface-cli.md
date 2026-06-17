# Agent Surface CLI

The Agent Surface CLI is the agent-native contract for Info. The UI consumes the
same Views and evidence, but it is not the source of truth.

## Canonical Views

The current Agent Surface is:

- `state.surface`
- `work.focus_set`
- `project.current`
- `memory.daily`
- `memory.profile`

Agents should inspect these through `mf`, then decide which tools or processors
to run. There is no required order.

## JSON Contract

Use `--json` for automation:

```bash
pnpm mf --json help
pnpm mf --json state
```

Success responses are:

```json
{ "ok": true, "command": "mf state", "data": {} }
```

Failures are non-zero and emit a stable error envelope on stderr:

```json
{ "ok": false, "command": "mf view trace missing", "error": { "code": "VIEW_NOT_FOUND", "message": "View not found: missing" } }
```

## Views

Read built-in specs and stored Views:

```bash
pnpm mf --json view list
pnpm mf --json view show work.focus_set
pnpm mf --json view latest project.current
pnpm mf --json view trace view:example
pnpm mf --json view search chrome-acp
```

Create or edit any dynamic View:

```bash
pnpm mf --json view upsert ./view.json --actor agent
cat ./view.json | pnpm mf --json view upsert - --actor user
```

The upsert path records provenance/audit metadata with actor, command, View id,
and View type.

## Processors

Discover and trigger allowed processors:

```bash
pnpm mf --json processor list
pnpm mf --json processor report
pnpm mf --json processor run processor.route_candidate --record obs:example
pnpm mf --json processor run processor.surface_state --view view:example
```

Processor runs write runtime evidence. Agents should use the returned run data
and provenance instead of treating `confidence` as the Agent Surface quality
signal.

## Agent Tasks

Realtime work can use `glance`/`think` processors or direct LLM-backed views.
Slow work that should be handled by Claude Code, Codex, ACP, or another agent
runtime goes through task Views and the unified queue surface:

```bash
pnpm mf --json task list --refresh
pnpm mf --json task queue --limit 8
pnpm mf --json task process --runtime local_mock --limit 8
pnpm mf --json task process --runtime claude_code --limit 3
pnpm mf --json task process --runtime acp_stdio --limit 3
```

`task list --refresh` writes/reads `agent.task_list`, which summarizes pending
and processed `task.background_research` and `task.toolsmith_prototype` Views.
HTTP clients can use `GET /agent/tasks?refresh=true` and `POST /agent/tasks` for
the same contract.

## Screenpipe

Query Screenpipe through Info without using the UI:

```bash
pnpm mf --json sensor screenpipe status
pnpm mf --json sensor screenpipe search --focused --app Cursor --start "30m ago"
pnpm mf --json sensor screenpipe search --browser-url github.com --start "2h ago"
pnpm mf --json sensor screenpipe search --window Warp --start "1h ago"
pnpm mf --json sensor screenpipe search --content-type audio --speaker junjie --start "6h ago"
```

Add `--write` to normalize returned Screenpipe items into Context Observations:

```bash
pnpm mf --json sensor screenpipe search --focused --start "30m ago" --write
```

Raw media stays in Screenpipe; Info stores normalized metadata and provenance.

## Markdown Memory

Daily and profile memory are editable markdown-backed Views.

```bash
pnpm mf --json memory daily show --date 2026-06-17
pnpm mf --json memory daily write --date 2026-06-17 --from memory/daily/2026-06-17.md --actor agent
pnpm mf --json memory daily sync --date 2026-06-17

pnpm mf --json memory profile show
pnpm mf --json memory profile write --from memory/profile/user.md --actor user
pnpm mf --json memory profile sync
```

The default markdown paths are `memory/daily/YYYY-MM-DD.md` and
`memory/profile/user.md`. Tests can override the root with `INFO_MEMORY_ROOT`.
