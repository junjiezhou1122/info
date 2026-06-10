# .metaflow

This directory is the **default workspace cwd** for Claude Code sessions
launched by the chrome-acp browser extension.

## Why this exists

When you open the Chrome ACP side panel and ask the agent a question
("what is on this page", "summarize the last hour", etc.), the
`acp-proxy` process spawns Claude Code (or any ACP-compatible agent) as a
child process. The agent's working directory controls what files and
project context it can `ls`, `read`, `grep`, and `edit`.

We default the cwd to this directory for two reasons:

1. **Isolation from the proxy server source.** The proxy lives in
   `apps/chrome-acp/packages/proxy-server/`. If the agent inherits that
   as its cwd, it will start listing framework files (`.gitignore`,
   `CLAUDE.md`, `package.json`) instead of answering the user's question
   about the current web page.
2. **A stable scratch space tied to the info project.** This folder lives
   inside the `info` repo, so any files the agent creates (session notes,
   scratch analyses, ad-hoc scripts) are easy to inspect and commit.

## What goes here

- Session scratch files the agent writes (notes, plans, temporary edits).
- An optional `.claude/` directory with project-scoped Claude Code
  configuration if you want the agent to behave differently from the
  global default.

## What does NOT go here

- Captured browser records, views, or runtime state — those live in the
  `data/` and `.runtime/` directories of the parent info repo and are
  served by the info context-layer HTTP server on `localhost:3111`.
  The agent reads those through the `info_search_context`, `info_get_view`,
  and `info_submit_feedback` MCP tools, not by reading files in this
  directory.

## Overriding the cwd

The chrome-acp extension's connection settings panel exposes a "Workspace
path" field. Whatever you put there overrides this default for that
session. The `acp-proxy` CLI also accepts `--cwd <path>` for headless
usage:

```bash
acp-proxy --no-auth --port 9315 --host 127.0.0.1 --cwd /Users/junjie/info/.metaflow claude-code-acp
```
