export type ViewProducerKind = "compiler" | "program" | "runtime" | "manual" | "agent";

export type ViewFamilyDefinition = {
  view_type: string;
  label: string;
  purpose: string;
  category: "semantic" | "project" | "ambient" | "runtime" | "memory" | "manual";
  producers: ViewProducerKind[];
  default_page_size?: number;
  manual_create?: boolean;
};

export const VIEW_FAMILY_DEFINITIONS: readonly ViewFamilyDefinition[] = [
  {
    view_type: "evidence",
    label: "EvidenceView",
    purpose: "Normalized evidence from raw observations.",
    category: "semantic",
    producers: ["compiler"],
    default_page_size: 120,
  },
  {
    view_type: "visual_frame",
    label: "VisualFrameView",
    purpose: "Screen semantics compressed from visual evidence.",
    category: "semantic",
    producers: ["compiler"],
    default_page_size: 80,
  },
  {
    view_type: "audio",
    label: "AudioView",
    purpose: "Speech or transcript semantics compressed from audio evidence.",
    category: "semantic",
    producers: ["compiler"],
    default_page_size: 60,
  },
  {
    view_type: "activity",
    label: "ActivityView",
    purpose: "Time-based activity chunks built from evidence.",
    category: "semantic",
    producers: ["compiler"],
    default_page_size: 120,
  },
  {
    view_type: "activity_block",
    label: "ActivityBlockView",
    purpose: "Short work blocks synthesized from visual, audio, and activity views.",
    category: "semantic",
    producers: ["compiler"],
    default_page_size: 60,
  },
  {
    view_type: "proposal",
    label: "ProposalView",
    purpose: "Control view that proposes which downstream views should exist.",
    category: "semantic",
    producers: ["compiler"],
    default_page_size: 80,
  },
  {
    view_type: "resource",
    label: "ResourceView",
    purpose: "Reusable material observed in the user's workflow.",
    category: "semantic",
    producers: ["compiler", "manual", "agent"],
    default_page_size: 60,
    manual_create: true,
  },
  {
    view_type: "intent",
    label: "IntentView",
    purpose: "Current or inferred goal signal.",
    category: "semantic",
    producers: ["compiler", "manual", "agent"],
    default_page_size: 60,
    manual_create: true,
  },
  {
    view_type: "workflow",
    label: "WorkflowView",
    purpose: "Structured work session composed from activities, resources, and intents.",
    category: "semantic",
    producers: ["compiler", "manual", "agent"],
    default_page_size: 60,
    manual_create: true,
  },
  {
    view_type: "memory",
    label: "MemoryView",
    purpose: "Durable agent/app-consumable memory.",
    category: "memory",
    producers: ["compiler", "program", "manual", "agent"],
    default_page_size: 60,
    manual_create: true,
  },
  {
    view_type: "thread.active_work",
    label: "Active Work",
    purpose: "Current work focus from project/context signals.",
    category: "project",
    producers: ["program"],
    default_page_size: 60,
  },
  {
    view_type: "project.current_context",
    label: "Project Context",
    purpose: "Current project state and relevant context.",
    category: "project",
    producers: ["program", "manual"],
    default_page_size: 60,
    manual_create: true,
  },
  {
    view_type: "brief.research",
    label: "Research Brief",
    purpose: "Research synthesis for a topic, resource, or active work thread.",
    category: "ambient",
    producers: ["program", "agent", "manual"],
    default_page_size: 60,
    manual_create: true,
  },
  {
    view_type: "brief.background_research",
    label: "Background Research",
    purpose: "Background research prepared from proactive task delegation.",
    category: "ambient",
    producers: ["agent", "runtime"],
    default_page_size: 80,
  },
  {
    view_type: "advice.research",
    label: "Research Advice",
    purpose: "Lightweight research suggestion surfaced at the right time.",
    category: "ambient",
    producers: ["program"],
    default_page_size: 80,
  },
  {
    view_type: "advice.writing_assist",
    label: "Writing Assist",
    purpose: "Inline-safe writing advice for active text editing.",
    category: "ambient",
    producers: ["program", "agent"],
    default_page_size: 80,
  },
  {
    view_type: "task.background_research",
    label: "Research Task",
    purpose: "Proactive background research task for an agent runtime.",
    category: "ambient",
    producers: ["program", "manual"],
    default_page_size: 80,
    manual_create: true,
  },
  {
    view_type: "draft.writing_continuation",
    label: "Writing Draft",
    purpose: "Editable writing continuation or draft.",
    category: "ambient",
    producers: ["program", "agent"],
    default_page_size: 80,
  },
  {
    view_type: "opportunity.tool",
    label: "Tool Opportunity",
    purpose: "Detected workflow improvement or small-tool opportunity.",
    category: "ambient",
    producers: ["program", "manual"],
    default_page_size: 80,
    manual_create: true,
  },
  {
    view_type: "task.toolsmith_prototype",
    label: "Toolsmith Task",
    purpose: "Task for drafting a local tool prototype without direct file edits.",
    category: "ambient",
    producers: ["program", "manual"],
    default_page_size: 80,
    manual_create: true,
  },
  {
    view_type: "draft.tool_prototype",
    label: "Tool Prototype",
    purpose: "Prototype plan for a workflow-improving tool.",
    category: "ambient",
    producers: ["agent", "program"],
    default_page_size: 80,
  },
  {
    view_type: "tool.prototype_artifact",
    label: "Tool Artifact",
    purpose: "Inspectable sandbox artifact compiled from a tool prototype.",
    category: "runtime",
    producers: ["runtime"],
    default_page_size: 80,
  },
  {
    view_type: "work_thread",
    label: "Work Thread",
    purpose: "Runtime-maintained candidate thread index.",
    category: "runtime",
    producers: ["runtime"],
    default_page_size: 60,
  },
  {
    view_type: "timeline.activity",
    label: "Activity Timeline",
    purpose: "Runtime activity timeline for UI and debugging.",
    category: "runtime",
    producers: ["runtime"],
    default_page_size: 60,
  },
  {
    view_type: "project_timeline",
    label: "Project Timeline",
    purpose: "Project-scoped timeline with records, events, and work threads.",
    category: "runtime",
    producers: ["runtime"],
    default_page_size: 60,
  },
  {
    view_type: "summary.project_work_episode",
    label: "Project Episode",
    purpose: "Episode summary for a work thread.",
    category: "runtime",
    producers: ["runtime"],
    default_page_size: 60,
  },
] as const;

export const VIEW_FAMILY_ORDER = VIEW_FAMILY_DEFINITIONS.map(definition => definition.view_type);

const VIEW_FAMILY_BY_TYPE = new Map(VIEW_FAMILY_DEFINITIONS.map(definition => [definition.view_type, definition]));

export function viewFamilyDefinition(viewType: string): ViewFamilyDefinition | undefined {
  return VIEW_FAMILY_BY_TYPE.get(viewType);
}

export function viewFamilyLabel(viewType: string): string {
  return viewFamilyDefinition(viewType)?.label ?? viewType;
}

export function viewFamilyPurpose(viewType: string): string {
  return viewFamilyDefinition(viewType)?.purpose ?? "view";
}

export function viewFamilyPageSize(viewType: string): number {
  return viewFamilyDefinition(viewType)?.default_page_size ?? 60;
}

export function manualViewFamilies(): ViewFamilyDefinition[] {
  return VIEW_FAMILY_DEFINITIONS.filter(definition => definition.manual_create);
}
