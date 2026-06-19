# Info

Info is a local-first ambient context runtime. It preserves raw evidence, derives reusable Views, and exposes those Views to agents and applications through a shared language.

## Language

**Observation**:
Raw evidence captured from the user's work or environment before interpretation.
_Avoid_: context item, fact, raw view

**Sensor Observation**:
A normalized Observation produced from an external capture source such as Screenpipe, Chrome, editor state, Git, or AI session metadata. Agents consume sensor information through Info's normalized Observations and derived Views, not through raw sensor backends.
_Avoid_: raw Screenpipe data, sensor API result

**Processor**:
A declared context transformation that consumes Observations or Views and produces new Observations, Views, Events, or tasks.
_Avoid_: program, task runner, hidden job

**Processor Run**:
One execution of a Processor, represented through runtime Events and the Observations or Views it read and wrote.
_Avoid_: task run, job, automation

**Processor Trigger**:
A policy-checked Agent Surface request to run a whitelisted Processor. A trigger must create Processor Run evidence and return the Observations or Views it produced.
_Avoid_: arbitrary execution, shell command, background task

**View**:
A derived, organized, interpreted, or application-ready context object that can be consumed by agents, processors, CLIs, and UIs.
_Avoid_: memory, summary, result

**Provenance Summary**:
A compact description of where a View came from: producer, source record count, source view count, freshness, status, and relevant scope. It does not use confidence as an agent-facing quality signal.
_Avoid_: confidence score, trust score

**Agent Surface**:
The stable query and action surface that external agents use to inspect Info state. It uses the current canonical View language only: `state.surface`, `work.focus_set`, `project.current`, `memory.daily`, and `memory.profile`, and can be reached through first-class adapters such as HTTP, CLI, and MCP.
_Avoid_: plugin API, UI API, old view family names

**Agent Tool**:
A composable operation exposed through the Agent Surface for reading or changing Info state. Tools do not prescribe a fixed workflow; the agent chooses which tool to call from the current task and available context.
_Avoid_: hardcoded step, wizard, UI workflow

**Agent CLI**:
A JSON-first command-line adapter for the Agent Surface with a fixed command whitelist, stable output schemas, and stable exit semantics.
_Avoid_: shell access, human-only script, arbitrary command runner

**Agent-Native Authority**:
The principle that an authorized agent may use the same Info capabilities available to a human operator. The system distinguishes actors through provenance, scope, cost, reversibility, and audit records rather than by treating agents as a lower permission class.
_Avoid_: agent-only sandbox, human-only operation

**Permission Prompt**:
A risk, cost, and reversibility interaction strategy for actions that should be confirmed or made explicit before execution. It is not a permission boundary between human and agent actors.
_Avoid_: agent permission tier, human approval gate

**State Surface**:
An ephemeral View of what is currently in front of the user, fused from browser, editor, media, and screen observations.
_Avoid_: current page, browser context

**Work Focus Set**:
A short-lived View of active work lanes inferred from normalized evidence such as Screenpipe search results, browser activity, local project signals, Git state, and AI session metadata. It groups recent evidence into lanes such as project, topic, domain, app, or communication without replacing the underlying sensor search layer.
_Avoid_: active thread, current task

**Activity Episode**:
A short-lived View that groups continuous Observations from the same stable user context, such as an application, page, window, project, or conversation, into one user-understandable activity segment.
_Avoid_: raw log, task, daily summary, legacy episode record

**Project Current**:
A project-scoped View of current project state derived from strong, fresh, provenance-backed project lanes in a Work Focus Set. It describes the current project identity, path, repo, active files, active webpages, active agent sessions, and supporting sources without recommending next actions.
_Avoid_: project.current_context, project summary

**Dynamic View**:
A View family is not permanent just because it exists. Info can add, reshape, promote, demote, or remove Views as agents and applications discover which derived context is useful. Canonical Views are only the currently stable agent-facing contract; lower-level projections and experiments can still exist behind them.
_Avoid_: fixed memory model, hardcoded view set

**Daily Memory**:
A markdown-backed `memory.daily` View that summarizes one calendar day's work, decisions, active projects, useful context, and notable evidence. It is editable and useful as a retrieval and compression layer, not as an irreversible fact store.
_Avoid_: memory.candidate, raw daily log

**Profile Memory**:
A markdown-backed `memory.profile` View derived from daily memories and explicit feedback. It is editable and records durable user preferences, thinking style, workflow patterns, project principles, and stable context that future agents should reuse.
_Avoid_: hidden preference store, confidence-ranked profile fact
