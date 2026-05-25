# Memory View Design

> Dedicated design note for how Info turns fixed observations into reusable,
> composable Memory Views.

## 1. Core Idea

Info should not treat memory as a raw storage problem.

The core model is:

```text
Observation
  -> Compression
  -> View
  -> Composition
  -> Memory View
```

More precisely:

```text
Fixed Observations
  -> many possible compression lenses
  -> many purpose-specific Views
  -> selected Views compose into higher-level Views
  -> only stable, useful Views become Memory Views
```

The important separation:

```text
Observation = evidence of what happened
View        = compressed interpretation for a purpose
Memory View = durable View that changes future behavior
MetaView    = proposal/control View that decides what Views should be created
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
  -> activity.segment
  -> evidence.resource
  -> resource.learning_material
  -> intent.candidate
  -> workflow.learning_session
  -> memory.learning_interest
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

L1 Evidence View
  cleaned, normalized evidence

L2 Activity View
  time-based compression of what the user did

L3 Intent / Task View
  hypothesis about what the user may be trying to do

L4 Workflow View
  structured session or task flow

L5 Memory View
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

### L1 Evidence View

Evidence Views normalize sensor-specific records into reusable evidence.

Examples:

```text
evidence.resource
evidence.interaction
evidence.screen_frame
evidence.app_focus
```

Example:

```json
{
  "view_type": "evidence.resource",
  "title": "Lecture 1 - How to Start a Startup",
  "content": {
    "resource_type": "web_video",
    "url": "https://www.youtube.com/watch?v=...",
    "domain": "youtube.com",
    "app": "chrome",
    "title": "Lecture 1 - How to Start a Startup",
    "selected_texts": ["115K", "Lecture 1 - How to Start a Startup"],
    "signal_counts": {
      "browser_heartbeat": 56,
      "selected_text": 2,
      "screen_frame": 3
    }
  },
  "source_records": ["..."]
}
```

This layer should be mostly deterministic.

### L2 Activity View

Activity Views compress evidence over time.

They answer:

```text
What was the user doing during this interval?
```

Examples:

```text
activity.segment
activity.resource_consumption
activity.app_focus
```

Example:

```json
{
  "view_type": "activity.segment",
  "title": "Watched YC startup lecture",
  "content": {
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
  "source_views": ["evidence.resource:..."],
  "confidence": 0.92,
  "lossiness": "medium"
}
```

This is the first layer that should drive the main timeline product.

### L3 Intent / Task View

Intent Views are hypotheses.

They should never pretend to be certain.

Examples:

```text
intent.candidate
task.thread
work_thread
```

Example:

```json
{
  "view_type": "intent.candidate",
  "title": "Possible study intent: startup/product feedback",
  "content": {
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
  "source_views": ["activity.segment:..."],
  "confidence": 0.68,
  "lossiness": "high"
}
```

### L4 Workflow View

Workflow Views compose multiple activities and intents into a task/session.

Examples:

```text
workflow.learning_session
workflow.research_session
workflow.coding_session
workflow.recipe
workflow.trace
workflow.attempt
```

Example:

```json
{
  "view_type": "workflow.learning_session",
  "title": "YC startup lecture study session",
  "content": {
    "phases": [
      "watched lecture",
      "selected key text",
      "opened Info timeline",
      "discussed memory architecture"
    ],
    "topic_candidates": ["startup", "product feedback", "memory architecture"],
    "open_questions": ["How should ActivitySegment feed IntentView?"]
  },
  "source_views": ["activity.segment:...", "intent.candidate:..."],
  "confidence": 0.74
}
```

### L5 Memory View

Memory Views are not just old summaries.

A Memory View is a durable View that should change future behavior.

Examples:

```text
memory.project.patterns
memory.user.preference
memory.learning_interest
memory.workflow_recipe
memory.surfacing_preference
memory.routine_patterns
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
  "view_type": "memory.project.patterns",
  "title": "Info architecture pattern: Observation to View",
  "content": {
    "claim": "The user prefers an architecture where raw observations remain fixed and multiple Views are generated through typed compression.",
    "applies_to": ["Info runtime", "memory architecture", "agent context"],
    "future_use": [
      "Prefer View-based derived state over mutating raw records",
      "Preserve provenance when summarizing user activity",
      "Do not treat timeline as memory directly"
    ]
  },
  "source_views": ["workflow.learning_session:...", "brief.research:..."],
  "confidence": 0.84,
  "stability": "project",
  "lossiness": "high"
}
```

## 5. MetaView As View Proposal

MetaView should not mean "metadata for a View".

In this system, MetaView means:

```text
A proposal/control View that decides what Views should be created from existing observations/views.
```

Recommended concrete type:

```text
proposal.view
```

Example:

```json
{
  "view_type": "proposal.view",
  "title": "Possible learning session around startup/product building",
  "content": {
    "hypothesis": "These observations look like a focused learning session.",
    "scope": {
      "start": "2026-05-25T14:11:27Z",
      "end": "2026-05-25T14:25:27Z",
      "apps": ["chrome"],
      "domains": ["youtube.com"]
    },
    "proposed_views": [
      {
        "view_type": "resource.learning_material",
        "priority": 0.9,
        "confidence": 0.93,
        "cost": "low",
        "decision": "materialize_now",
        "reason": "continuous YouTube dwell with selected title text"
      },
      {
        "view_type": "intent.candidate",
        "priority": 0.7,
        "confidence": 0.68,
        "cost": "medium",
        "decision": "defer_or_agent",
        "reason": "intent is plausible but not explicit"
      },
      {
        "view_type": "workflow.learning_session",
        "priority": 0.55,
        "confidence": 0.5,
        "cost": "medium",
        "decision": "defer",
        "reason": "needs more evidence from notes, searches, or chat"
      }
    ]
  },
  "source_views": ["activity.segment:..."],
  "compiler": {
    "id": "program.view_proposal",
    "mode": "hybrid"
  },
  "confidence": 0.78,
  "stability": "session"
}
```

MetaView answers:

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
memory.project.patterns
  -> workflow.learning_session
  -> intent.candidate
  -> activity.segment
  -> evidence.resource
  -> observation.browser_page_heartbeat
```

This keeps high-level Views compact while preserving explainability.

Composition rules:

```text
L1 Evidence can cite raw observations directly.
L2 Activity should cite L1 Evidence plus key records.
L3 Intent should cite L2 Activity.
L4 Workflow should cite L2/L3 Views.
L5 Memory should cite L4/L3 Views, not thousands of raw records.
```

## 7. Query Answering With Memory Views

User questions should retrieve multiple View families.

Example:

```text
Question: "我刚刚在研究什么？"

Retrieve:
  activity.segment
  evidence.resource
  intent.candidate
  workflow.learning_session
  brief.research
  memory.project.patterns

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
evidence.resource
activity.segment
source URL normalization
duration / dwell calculations
basic proposal rules
```

Hybrid / agent:

```text
intent.candidate
workflow.learning_session
brief.research
memory.project.patterns
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

Memory View should only become long-term when it survives feedback or reuse.

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
  -> evidence.resource
  -> activity.segment
  -> proposal.view
```

Then:

```text
proposal.view
  -> resource.learning_material
  -> intent.candidate
```

Only after that:

```text
workflow.learning_session
  -> memory.project.patterns
  -> memory.learning_interest
```

Do not start by generating long-term memory directly from raw observations.

## 11. Current Naming Recommendations

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
evidence.resource
evidence.interaction
evidence.screen_frame
activity.segment
proposal.view
intent.candidate
workflow.learning_session
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

## 12. Summary

The design should preserve this invariant:

```text
Raw observations stay fixed.
Compression creates purpose-specific Views.
Views compose through provenance.
MetaView/proposal decides what to materialize.
Only durable, useful, behavior-changing Views become Memory Views.
```

Short version:

```text
Observation is evidence.
View is compression.
Proposal is control.
Memory View is reusable behavior-shaping knowledge.
```
