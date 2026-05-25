# Memory View Design

> Dedicated design note for how Info turns fixed observations into reusable,
> composable Memory Views.

## 1. Core Idea

Info should not treat memory as a raw storage problem.

The core model is:

```text
Observation
  -> EvidenceView
  -> ActivityView
  -> IntentView / WorkflowView
  -> MemoryView
  -> Agent / App consumption
```

More precisely:

```text
Fixed Observations
  -> normalized evidence nodes
  -> time/activity compression
  -> goal/workflow interpretation
  -> durable memory views
  -> consumed by agents, apps, and other compilers
```

The important separation:

```text
Observation = raw source of truth about what was captured
EvidenceView = normalized evidence from one or more observations
ActivityView = time-based compression of evidence into "what happened"
IntentView   = hypothesis about goal or task
WorkflowView = structured task/session composed from activities and intents
MemoryView   = durable View that changes future behavior
ProposalView = control View that decides what Views should be created next
```

The system is therefore not a single summarizer. It is a View graph:

```text
Observation
  -> EvidenceView
  -> ActivityView
  -> IntentView
  -> WorkflowView
  -> MemoryView

Any View can become input to another View.
Agents and applications consume Views, not raw sensor logs by default.
```

## 2. Why Observation And View Must Be Separate

Observation is the source of truth.

It should record facts:

```text
browser heartbeat
selected text
screen OCR
UI click
app/window focus
local project snapshot
agent session pointer
```

It should not decide:

```text
what the user intended
whether something is important
which project this belongs to
whether this should become long-term memory
```

Those are inferences. They belong in Views.

This separation matters because the same Observation can support many different
Views:

```text
One YouTube watch session
  -> EvidenceView(kind="page")
  -> ActivityView(kind="resource_consumption")
  -> IntentView(kind="learning_candidate")
  -> WorkflowView(kind="learning_session")
  -> MemoryView(kind="learning_interest")
```

The original data stays fixed. The interpretations can evolve.

## 3. View As Compression Lens

A View is not just a summary.

A View is a typed compression result with a purpose.

Every View should answer:

```text
What did this compress?
Why was this compression useful?
What was preserved?
What was lost?
What queries can this View answer?
What queries should not use this View?
What source records/views prove it?
How confident is it?
When does it expire?
```

Minimal contract:

```ts
type ContextView = {
  id?: string;
  view_type: string;
  status?: "candidate" | "accepted" | "archived" | "rejected";

  source_records?: string[];
  source_views?: string[];

  compiler?: {
    id: string;
    version?: string;
    mode?: "deterministic" | "llm" | "hybrid";
  };

  purpose?: string;
  scope?: {
    project?: string;
    project_path?: string;
    repo?: string;
    domain?: string;
    app?: string;
    plugin_id?: string;
    time_range?: { start?: string; end?: string };
  };

  content?: Record<string, unknown>;
  confidence?: number;
  stability?: "ephemeral" | "session" | "project" | "long_term";
  lossiness?: "none" | "low" | "medium" | "high";
  validity?: {
    valid_from?: string;
    valid_until?: string;
    stale_after?: string;
  };
  metadata?: Record<string, unknown>;
};
```

## 4. View Layers

The View hierarchy should be explicit.

```text
L0 Observation
  raw evidence, not a View

L1 EvidenceView
  cleaned, normalized evidence

L2 ActivityView
  time-based compression of what the user did

L3 IntentView / TaskView
  hypothesis about what the user may be trying to do

L4 WorkflowView
  structured session or task flow

L5 MemoryView
  stable knowledge that should affect future behavior
```

### L0 Observation

Examples:

```text
observation.browser_page_heartbeat
observation.browser_text_selected
observation.screenpipe_activity_summary
observation.screenpipe_input_event
observation.screenpipe_workspace_signal
observation.local_project
```

Rules:

```text
immutable when possible
raw facts only
high volume allowed
not directly used as memory
```

### L1 EvidenceView

EvidenceViews normalize sensor-specific records into reusable evidence.

The preferred concept name is `EvidenceView`.

```text
EvidenceView
```

In storage, keep the View family simple:

```text
view_type = "evidence"
content.kind = "page" | "screen" | "focus" | "input" | "selection" | "project" | "agent_session" | "resource" | "other"
```

Do not create a new top-level `view_type` for every sensor-specific evidence
shape unless there is a strong product reason. New data sources should usually
extend `content.kind`, `content.subject`, `content.signals`, or
`content.data`.

Minimal content contract:

```ts
type EvidenceViewContent = {
  kind: string;
  observed_at: string;

  origin: {
    schema: string;
    source: string;
    connector?: string;
  };

  subject: {
    type?: string;
    app?: string;
    title?: string;
    window?: string;
    url?: string;
    domain?: string;
    path?: string;
    project?: string;
  };

  signals?: {
    text?: string;
    event?: string;
    selected_text?: string;
    duration_seconds?: number;
    frame_ids?: Array<string | number>;
    metrics?: Record<string, number>;
  };

  claims?: string[];
  quality?: {
    confidence?: number;
    reason?: string;
  };

  data?: Record<string, unknown>;
};
```

`claims` and `quality.confidence` are optional helper indexes. They should come
from deterministic source mapping, not LLM interpretation.

Example page evidence:

```json
{
  "view_type": "evidence",
  "title": "Stanford CS153 Frontier Systems - YouTube",
  "content": {
    "kind": "page",
    "observed_at": "2026-05-25T16:23:57Z",
    "origin": {
      "schema": "observation.browser_page_heartbeat",
      "source": "browser",
      "connector": "chrome-extension"
    },
    "subject": {
      "type": "page",
      "app": "Chrome",
      "title": "Stanford CS153 Frontier Systems - YouTube",
      "url": "https://www.youtube.com/watch?v=Lri2LNYtERM",
      "domain": "youtube.com"
    },
    "signals": {
      "duration_seconds": 26751,
      "metrics": {
        "scroll_depth": 0.54,
        "selection_count": 6
      }
    },
    "claims": ["page_visible", "resource_seen"],
    "quality": {
      "confidence": 0.9,
      "reason": "browser extension reported current page URL"
    }
  },
  "source_records": ["..."]
}
```

This layer should be mostly deterministic.
It should not say what the user intended. It only says what was observed and
what this evidence can directly support.

### L2 ActivityView

ActivityViews compress EvidenceViews over time.

They answer:

```text
What was the user doing during this interval?
```

Examples:

```text
ActivityView(kind="segment")
ActivityView(kind="resource_consumption")
ActivityView(kind="app_focus")
```

Suggested storage shape:

```text
view_type = "activity"
content.kind = "segment" | "resource_consumption" | "app_focus" | "debugging" | "coding" | "reading" | "other"
```

Example:

```json
{
  "view_type": "activity",
  "title": "Watched YC startup lecture",
  "content": {
    "kind": "resource_consumption",
    "start": "2026-05-25T14:11:27Z",
    "end": "2026-05-25T14:25:27Z",
    "duration_minutes": 14,
    "app": "chrome",
    "resource": {
      "type": "url",
      "url": "https://www.youtube.com/watch?v=...",
      "title": "Lecture 1 - How to Start a Startup"
    },
    "action": "watching_or_reading",
    "evidence_summary": {
      "browser_heartbeats": 53,
      "selected_texts": 2,
      "screen_frames": 3
    }
  },
  "source_views": ["evidence:..."],
  "confidence": 0.92,
  "lossiness": "medium"
}
```

This is the first layer that should drive the main timeline product.

### L3 IntentView / TaskView

IntentViews are hypotheses.

They should never pretend to be certain.

Examples:

```text
IntentView(kind="candidate")
TaskView(kind="thread")
work_thread
```

Suggested storage shape:

```text
view_type = "intent"
content.kind = "candidate" | "explicit_goal" | "task_thread" | "question" | "other"
```

Example:

```json
{
  "view_type": "intent",
  "title": "Possible study intent: startup/product feedback",
  "content": {
    "kind": "candidate",
    "hypothesis": "User may be studying startup and product feedback concepts.",
    "supporting_signals": [
      "14 minutes on YC startup lecture",
      "selected lecture title",
      "OCR contains product feedback and founder topics"
    ],
    "counter_signals": [
      "No explicit note was written",
      "No follow-up query yet"
    ]
  },
  "source_views": ["activity:..."],
  "confidence": 0.68,
  "lossiness": "high"
}
```

### L4 WorkflowView

WorkflowViews compose multiple activities and intents into a task/session.

Examples:

```text
WorkflowView(kind="learning_session")
WorkflowView(kind="research_session")
WorkflowView(kind="coding_session")
WorkflowView(kind="recipe")
WorkflowView(kind="trace")
WorkflowView(kind="attempt")
```

Suggested storage shape:

```text
view_type = "workflow"
content.kind = "learning_session" | "research_session" | "coding_session" | "recipe" | "trace" | "attempt" | "other"
```

Example:

```json
{
  "view_type": "workflow",
  "title": "YC startup lecture study session",
  "content": {
    "kind": "learning_session",
    "phases": [
      "watched lecture",
      "selected key text",
      "opened Info timeline",
      "discussed memory architecture"
    ],
    "topic_candidates": ["startup", "product feedback", "memory architecture"],
    "open_questions": ["How should ActivitySegment feed IntentView?"]
  },
  "source_views": ["activity:...", "intent:..."],
  "confidence": 0.74
}
```

### L5 MemoryView

MemoryViews are not just old summaries.

A MemoryView is a durable View that should change future behavior.

Examples:

```text
MemoryView(kind="project_pattern")
MemoryView(kind="user_preference")
MemoryView(kind="learning_interest")
MemoryView(kind="workflow_recipe")
MemoryView(kind="surfacing_preference")
MemoryView(kind="routine_pattern")
```

Suggested storage shape:

```text
view_type = "memory"
content.kind = "project_pattern" | "user_preference" | "learning_interest" | "workflow_recipe" | "surfacing_preference" | "routine_pattern" | "other"
```

Entry conditions should be strict:

```text
user explicitly asked to remember
or repeated signal appears over time
or a View was used successfully in future answers
or user feedback marked it useful
or it changes routing/surfacing/policy
```

Example:

```json
{
  "view_type": "memory",
  "title": "Info architecture pattern: Observation to View",
  "content": {
    "kind": "project_pattern",
    "claim": "The user prefers an architecture where raw observations remain fixed and multiple Views are generated through typed compression.",
    "applies_to": ["Info runtime", "memory architecture", "agent context"],
    "future_use": [
      "Prefer View-based derived state over mutating raw records",
      "Preserve provenance when summarizing user activity",
      "Do not treat timeline as memory directly"
    ]
  },
  "source_views": ["workflow:...", "brief.research:..."],
  "confidence": 0.84,
  "stability": "project",
  "lossiness": "high"
}
```

## 5. ProposalView As View Proposal

`MetaView` should not mean "metadata for a View".

In this system, if we use the word `MetaView`, it should mean:

```text
A proposal/control View that decides what Views should be created from existing observations/views.
```

Recommended concrete type:

```text
ProposalView
view_type = "proposal"
content.kind = "view_proposal"
```

Example:

```json
{
  "view_type": "proposal",
  "title": "Possible learning session around startup/product building",
  "content": {
    "kind": "view_proposal",
    "hypothesis": "These observations look like a focused learning session.",
    "scope": {
      "start": "2026-05-25T14:11:27Z",
      "end": "2026-05-25T14:25:27Z",
      "apps": ["chrome"],
      "domains": ["youtube.com"]
    },
    "proposed_views": [
      {
        "view_type": "resource",
        "kind": "learning_material",
        "priority": 0.9,
        "confidence": 0.93,
        "cost": "low",
        "decision": "materialize_now",
        "reason": "continuous YouTube dwell with selected title text"
      },
      {
        "view_type": "intent",
        "kind": "candidate",
        "priority": 0.7,
        "confidence": 0.68,
        "cost": "medium",
        "decision": "defer_or_agent",
        "reason": "intent is plausible but not explicit"
      },
      {
        "view_type": "workflow",
        "kind": "learning_session",
        "priority": 0.55,
        "confidence": 0.5,
        "cost": "medium",
        "decision": "defer",
        "reason": "needs more evidence from notes, searches, or chat"
      }
    ]
  },
  "source_views": ["activity:..."],
  "compiler": {
    "id": "program.view_proposal",
    "mode": "hybrid"
  },
  "confidence": 0.78,
  "stability": "session"
}
```

ProposalView answers:

```text
What can be compressed next?
Why is it worth doing?
Which ViewType should be used?
Should it be materialized now, deferred, rejected, or sent to an agent?
```

## 6. View Composition

Views should compose through `source_views`, not by copying entire upstream
content.

Preferred provenance path:

```text
MemoryView
  -> WorkflowView
  -> IntentView
  -> ActivityView
  -> EvidenceView
  -> observation.browser_page_heartbeat
```

This keeps high-level Views compact while preserving explainability.

Composition rules:

```text
L1 EvidenceView can cite raw observations directly.
L2 ActivityView should cite L1 EvidenceViews plus key records.
L3 IntentView should cite L2 ActivityViews.
L4 WorkflowView should cite L2/L3 Views.
L5 MemoryView should cite L4/L3 Views, not thousands of raw records.
```

Agents and applications should normally consume the highest View that matches
their job:

```text
timeline UI       -> ActivityView + selected EvidenceView attribution
debug inspector   -> EvidenceView
daily summary     -> ActivityView / WorkflowView
coding assistant  -> WorkflowView / work_thread / MemoryView
preference router -> MemoryView / ProposalView
external answer   -> local Views + external extraction Views
```

Raw Observations remain available for audit and recompilation, but they are not
the default interface for agents.

## 7. Query Answering With Memory Views

User questions should retrieve multiple View families.

Example:

```text
Question: "我刚刚在研究什么？"

Retrieve:
  ActivityView
  EvidenceView
  IntentView
  WorkflowView
  brief.research
  MemoryView

If missing source content:
  external retrieval
  -> source.content / extraction.video_transcript
  -> answer
```

Answer output should include:

```ts
type MemoryAnswer = {
  answer: string;
  confidence: number;
  used_views: string[];
  used_records: string[];
  external_sources?: string[];
  missing_context?: string[];
};
```

External retrieval should not bypass Views.

It should write:

```text
source.content
extraction.reader_snapshot
extraction.video_transcript
```

Then the answer uses those Views.

## 8. Deterministic First, Agent When Needed

Not every View needs an LLM.

Deterministic:

```text
EvidenceView
ActivityView
source URL normalization
duration / dwell calculations
basic proposal rules
```

Hybrid / agent:

```text
IntentView
WorkflowView
brief.research
MemoryView
contradiction detection
view proposal prioritization
```

Rule:

```text
Use deterministic compilers for structure.
Use agents for ambiguous meaning.
```

## 9. Lifecycle

View lifecycle:

```text
candidate
  -> accepted
  -> archived
  -> rejected
```

Additional validity:

```text
valid_from
valid_until
stale_after
```

MemoryView should only become long-term when it survives feedback or reuse.

```text
single signal        -> candidate
repeated / confirmed -> accepted
unused / stale       -> archived
wrong                -> rejected
```

## 10. First Implementation Slice

The first slice should be:

```text
Observation
  -> EvidenceView
  -> ActivityView
  -> ProposalView
```

Then:

```text
ProposalView
  -> ResourceView(kind="learning_material")
  -> IntentView
```

Only after that:

```text
WorkflowView
  -> MemoryView(kind="project_pattern")
  -> MemoryView(kind="learning_interest")
```

Do not start by generating long-term memory directly from raw observations.

## 11. Naming Recommendations

Use human-facing concept names for architecture discussion:

```text
EvidenceView
ActivityView
IntentView
TaskView
WorkflowView
MemoryView
ProposalView
ResourceView
AnswerView
```

Use simple storage `view_type` families where possible:

```text
evidence
activity
intent
task
workflow
memory
proposal
resource
answer
```

Use `content.kind` for specialization:

```text
EvidenceView:
  view_type = evidence
  content.kind = page | screen | focus | input | selection | project | agent_session | resource | other

ActivityView:
  view_type = activity
  content.kind = segment | resource_consumption | app_focus | debugging | coding | reading | other

IntentView:
  view_type = intent
  content.kind = candidate | explicit_goal | task_thread | question | other

WorkflowView:
  view_type = workflow
  content.kind = learning_session | research_session | coding_session | recipe | trace | attempt | other

MemoryView:
  view_type = memory
  content.kind = project_pattern | user_preference | learning_interest | workflow_recipe | surfacing_preference | routine_pattern | other
```

This keeps the graph easy to query:

```text
find all evidence        -> view_type = evidence
find screen evidence     -> view_type = evidence AND content.kind = screen
find all memory          -> view_type = memory
find user preferences    -> view_type = memory AND content.kind = user_preference
```

Backward compatibility:

Existing names can remain while the system migrates. They are concrete product
views or legacy names, not the long-term conceptual naming style.

Keep:

```text
timeline.activity
timeline.observations
project.current_context
brief.research
memory.*
routing.shortcut
analysis.browser_page
extraction.reader_snapshot
app.language.learning_pack
work_thread
```

Add:

```text
evidence
activity
proposal
intent
workflow
memory
resource
answer
source.content
extraction.video_transcript
```

Gradually migrate:

```text
analysis.browser_agent_task -> analysis.browser_page
project_timeline            -> timeline.project
thread.active_work          -> work_thread or activity/workflow View
thread.display_card         -> app/thread UI View
advice.browser_ambient      -> analysis/advice namespace only if reused
```

## 12. Current Implementation Contract

The runtime now materializes the new View family design directly:

```text
Observation
  -> EvidenceView   view_type = evidence
  -> ActivityView   view_type = activity
  -> ProposalView   view_type = proposal
  -> ResourceView   view_type = resource
  -> IntentView     view_type = intent
  -> WorkflowView   view_type = workflow
  -> MemoryView     view_type = memory, only after promotion rules
```

Implementation files:

```text
src/runtime/evidence-view.ts
  deterministic Observation -> EvidenceView compiler

src/runtime/memory-views.ts
  EvidenceView -> ActivityView compiler
  ActivityView -> ProposalView compiler
  ProposalView -> ResourceView compiler
  ProposalView -> IntentView compiler
  IntentView + ResourceView + ActivityView -> WorkflowView compiler
  repeated WorkflowView topic -> MemoryView compiler
  MemoryView builder contract

src/runtime/runtime.ts
  runtime tick compiles evidence, activity, proposal, resource, intent,
  workflow, then memory

ui/src/main.tsx
  displays current View family counts in the Timeline page
```

The current `EvidenceView` content shape is:

```ts
{
  kind: "page" | "screen" | "focus" | "input" | "selection" | "project" | "agent_session" | "resource" | "other";
  observed_at: string;
  origin: {
    schema: string;
    source: string;
    connector?: string;
  };
  subject: {
    type?: string;
    app?: string;
    title?: string;
    window?: string;
    url?: string;
    domain?: string;
    path?: string;
    project?: string;
  };
  signals?: {
    text?: string;
    event?: string;
    selected_text?: string;
    duration_seconds?: number;
    frame_ids?: Array<string | number>;
    metrics?: Record<string, number>;
  };
  claims?: string[];
  quality?: {
    confidence?: number;
    reason?: string;
  };
  data?: Record<string, unknown>;
}
```

The current `ActivityView` content shape is:

```ts
{
  kind: "resource_consumption" | "app_focus" | "coding" | "segment";
  start: string;
  end: string;
  duration_minutes: number;
  app?: string;
  domain?: string;
  project?: string;
  resource?: {
    type: "url";
    url: string;
    title?: string;
    domain?: string;
  };
  action: "watching_or_reading" | "using_app" | "working_in_project" | "working_or_browsing";
  evidence_summary: {
    evidence_views: number;
    kinds: Record<string, number>;
    origins: Record<string, number>;
    frame_ids?: string[];
  };
}
```

The current `ProposalView` content shape is:

```ts
{
  kind: "view_proposal";
  hypothesis: string;
  scope: {
    start?: string;
    end?: string;
    apps?: string[];
    domains?: string[];
  };
  proposed_views: Array<{
    view_type: "resource" | "intent" | "workflow" | string;
    kind: string;
    priority: number;
    confidence: number;
    cost: "low" | "medium" | "high";
    decision: "materialize_now" | "defer_or_agent" | "defer" | "reject";
    reason: string;
  }>;
}
```

The current `ResourceView` content shape is:

```ts
{
  kind: "learning_material" | "web_resource" | string;
  resource: {
    type: "url" | string;
    url: string;
    title?: string;
    domain?: string;
  };
  observed_activity: {
    start?: string;
    end?: string;
    duration_minutes?: number;
    action?: string;
  };
  evidence_summary?: Record<string, unknown>;
  use_cases: string[];
  proposal: {
    decision?: string;
    reason?: string;
    priority?: number;
  };
}
```

The current `IntentView` content shape is:

```ts
{
  kind: "candidate";
  hypothesis: string;
  supporting_signals: string[];
  counter_signals: string[];
  suggested_workflow_kind: "learning_session" | "research_session" | "coding_session" | string;
  proposed_by?: string;
}
```

The current `WorkflowView` content shape is:

```ts
{
  kind: "learning_session" | "research_session" | "coding_session" | string;
  phases: string[];
  topic_candidates: string[];
  open_questions: string[];
  activity: {
    kind?: string;
    start?: string;
    end?: string;
    duration_minutes?: number;
    action?: string;
  };
  resources: Array<Record<string, unknown>>;
  intent: {
    hypothesis?: string;
    confidence?: number;
  };
}
```

The current automatic `MemoryView` compiler is intentionally strict:

```text
single WorkflowView topic      -> no MemoryView
repeated WorkflowView topic(s) -> MemoryView(kind="learning_interest")
```

Current generated `MemoryView` content extends the minimal contract with
promotion evidence:

```ts
{
  kind: "learning_interest";
  claim: string;
  applies_to: string[];
  future_use: string[];
  evidence: {
    workflow_count: number;
    workflow_titles: string[];
  };
}
```

## 13. MemoryView Catalog

`MemoryView` should stay stricter than other Views. It is only for durable,
behavior-changing knowledge.

Recommended `content.kind` catalog:

```text
project_pattern
  A stable architectural or implementation pattern in this project.
  Example: "Info keeps Observations fixed and generates purpose-specific Views."

user_preference
  A persistent user preference that should alter future answers or UI behavior.
  Example: "The user prefers simple schemas with family + kind over many top-level view types."

learning_interest
  A repeated or confirmed learning topic.
  Example: "The user is actively studying memory systems and agent workflows."

workflow_recipe
  A reusable way to perform a task.
  Example: "When changing View compilers, write tests first, then update runtime, then verify UI."

surfacing_preference
  A preference about what should be shown, hidden, or ranked.
  Example: "Hide low-level Screenpipe recorder activity by default, keep it available in debug."

routine_pattern
  A repeated activity pattern worth recognizing proactively.
  Example: "Morning coding sessions often start with Screenpipe/runtime timeline inspection."

tooling_constraint
  A constraint that should prevent repeated mistakes.
  Example: "Do not write derived intelligence as context_records; write it as context_views."
```

Minimal `MemoryView` content:

```ts
{
  kind: string;
  claim: string;
  applies_to: string[];
  future_use: string[];
}
```

Promotion rule:

```text
EvidenceView and ActivityView can be deterministic candidates.
IntentView and WorkflowView can be agent hypotheses.
MemoryView should require explicit user instruction, repeated evidence, positive feedback, or successful reuse.
```

## 14. Summary

The design should preserve this invariant:

```text
Raw observations stay fixed.
Compression creates purpose-specific View nodes.
Views compose through provenance.
ProposalView decides what to materialize.
Agents and apps consume Views by default.
Only durable, useful, behavior-changing Views become MemoryViews.
```

Short version:

```text
Observation is raw source of truth.
EvidenceView is normalized evidence.
ActivityView is what happened over time.
IntentView is a hypothesis.
WorkflowView is task/session structure.
ProposalView is control.
MemoryView is reusable behavior-shaping knowledge.
```
