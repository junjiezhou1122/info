import { createHash } from "node:crypto";
import { ContextStore } from "../core/store.js";
import type { ContextView, StoredContextView } from "../core/types.js";

export const ACTIVITY_VIEW_COMPILER_ID = "builtin.activity-view";
export const PROPOSAL_VIEW_COMPILER_ID = "builtin.proposal-view";
export const MEMORY_VIEW_COMPILER_ID = "builtin.memory-view";

export type CompileActivityViewsOptions = {
  minutes?: number;
  limit?: number;
  write?: boolean;
  evidenceViews?: Array<ContextView | StoredContextView>;
  mergeGapMinutes?: number;
};

export type CompileProposalViewsOptions = {
  limit?: number;
  write?: boolean;
  activityViews?: Array<ContextView | StoredContextView>;
};

export type CompileViewResult = {
  ok: true;
  compiler_id: string;
  generated_at: string;
  views: Array<ContextView | StoredContextView>;
  source_views_used: number;
};

export function compileActivityViews(options: CompileActivityViewsOptions = {}, store = new ContextStore()): CompileViewResult {
  const generatedAt = new Date().toISOString();
  const minutes = options.minutes ?? 240;
  const limit = options.limit ?? 500;
  const evidenceViews = (options.evidenceViews ?? store.listViews({
    view_types: ["evidence"],
    active_only: true,
    limit: Math.max(limit * 2, limit + 50),
    timeWindow: { minutes },
  }))
    .filter(view => view.view_type === "evidence")
    .filter(view => typeof view.content?.kind === "string")
    .slice(0, limit);
  const views = buildActivityViewsFromEvidence(evidenceViews, generatedAt, options.mergeGapMinutes ?? 3);
  const stored = (options.write ?? true) ? views.map(view => store.upsertView(view)) : views;

  if (options.write ?? true) {
    store.appendRuntimeEvent({
      event_type: "view_compiled",
      actor: "system",
      status: "completed",
      subject_type: "view",
      plugin_id: ACTIVITY_VIEW_COMPILER_ID,
      related_views: stored.map(view => view.id).filter(Boolean) as string[],
      payload: {
        view_type: "activity",
        evidence_views_used: evidenceViews.length,
        views_compiled: stored.length,
      },
    });
  }

  return {
    ok: true,
    compiler_id: ACTIVITY_VIEW_COMPILER_ID,
    generated_at: generatedAt,
    views: stored,
    source_views_used: evidenceViews.length,
  };
}

export function compileProposalViews(options: CompileProposalViewsOptions = {}, store = new ContextStore()): CompileViewResult {
  const generatedAt = new Date().toISOString();
  const limit = options.limit ?? 100;
  const activityViews = (options.activityViews ?? store.listViews({
    view_types: ["activity"],
    active_only: true,
    limit,
  }))
    .filter(view => view.view_type === "activity")
    .slice(0, limit);
  const views = activityViews
    .map(view => buildProposalView(view, generatedAt))
    .filter((view): view is ContextView => Boolean(view));
  const stored = (options.write ?? true) ? views.map(view => store.upsertView(view)) : views;

  if (options.write ?? true) {
    store.appendRuntimeEvent({
      event_type: "view_compiled",
      actor: "system",
      status: "completed",
      subject_type: "view",
      plugin_id: PROPOSAL_VIEW_COMPILER_ID,
      related_views: stored.map(view => view.id).filter(Boolean) as string[],
      payload: {
        view_type: "proposal",
        activity_views_used: activityViews.length,
        views_compiled: stored.length,
      },
    });
  }

  return {
    ok: true,
    compiler_id: PROPOSAL_VIEW_COMPILER_ID,
    generated_at: generatedAt,
    views: stored,
    source_views_used: activityViews.length,
  };
}

export function buildMemoryView(input: {
  id?: string;
  title: string;
  kind: string;
  claim: string;
  applies_to?: string[];
  future_use?: string[];
  source_views?: string[];
  confidence?: number;
  stability?: ContextView["stability"];
}): ContextView {
  return {
    id: input.id ?? `memory:${input.kind}:${stableKey(`${input.title}|${input.claim}|${(input.source_views ?? []).join("|")}`)}`,
    view_type: "memory",
    title: input.title,
    summary: input.claim,
    status: "candidate",
    source_views: input.source_views ?? [],
    compiler: { id: MEMORY_VIEW_COMPILER_ID, version: "1", mode: "hybrid" },
    purpose: "Durable knowledge that changes future behavior for agents and applications.",
    content: {
      kind: input.kind,
      claim: input.claim,
      applies_to: input.applies_to ?? [],
      future_use: input.future_use ?? [],
    },
    confidence: input.confidence ?? 0.7,
    stability: input.stability ?? "project",
    lossiness: "high",
    privacy: { level: "private", retention: "normal", allow_embedding: true, allow_llm_summary: true, allow_external_llm: false },
  };
}

function buildActivityViewsFromEvidence(evidenceViews: Array<ContextView | StoredContextView>, generatedAt: string, mergeGapMinutes: number): ContextView[] {
  const sorted = [...evidenceViews].sort((a, b) => Date.parse(observedAt(a)) - Date.parse(observedAt(b)));
  const groups: Array<Array<ContextView | StoredContextView>> = [];
  const active = new Map<string, Array<ContextView | StoredContextView>>();

  const flush = (key: string) => {
    const group = active.get(key);
    if (group?.length) groups.push(group);
    active.delete(key);
  };

  for (const view of sorted) {
    const key = activityGroupKey(view);
    if (!key) continue;
    const existing = active.get(key);
    if (!existing?.length) {
      active.set(key, [view]);
      continue;
    }
    const last = existing.at(-1)!;
    const gap = Date.parse(observedAt(view)) - Date.parse(observedAt(last));
    if (Number.isFinite(gap) && gap <= mergeGapMinutes * 60_000) existing.push(view);
    else {
      flush(key);
      active.set(key, [view]);
    }
  }
  for (const key of [...active.keys()]) flush(key);

  return groups.map(group => groupToActivityView(group, generatedAt));
}

function groupToActivityView(group: Array<ContextView | StoredContextView>, generatedAt: string): ContextView {
  const sorted = [...group].sort((a, b) => Date.parse(observedAt(a)) - Date.parse(observedAt(b)));
  const first = sorted[0];
  const last = sorted.at(-1) ?? first;
  const start = observedAt(first);
  const end = observedAt(last);
  const kind = activityKindForGroup(sorted);
  const resource = resourceOf(sorted);
  const app = top(sorted.map(view => subjectOf(view).app).filter(isString), 1)[0];
  const domain = top(sorted.map(view => subjectOf(view).domain).filter(isString), 1)[0];
  const project = top(sorted.map(view => subjectOf(view).project).filter(isString), 1)[0];
  const sourceViews = sorted.map(view => view.id).filter(isString);
  const sourceRecords = unique(sorted.flatMap(view => view.source_records ?? []));
  const fallbackTitle = [app, domain, project].filter(Boolean).join(" - ") || "Activity";
  const title = stringValue(resource?.title) ?? fallbackTitle;

  return {
    id: `activity:${kind}:${stableKey(`${sourceViews.join("|")}|${start}|${end}`)}`,
    view_type: "activity",
    title,
    summary: `${kind} from ${start} to ${end} using ${sourceViews.length} EvidenceViews.`,
    status: "candidate",
    source_records: sourceRecords,
    source_views: sourceViews,
    compiler: { id: ACTIVITY_VIEW_COMPILER_ID, version: "1", mode: "deterministic" },
    purpose: "Compress normalized EvidenceViews over time into what the user was doing.",
    scope: {
      app,
      domain,
      project,
      plugin_id: ACTIVITY_VIEW_COMPILER_ID,
      time_range: { start, end },
    },
    content: {
      kind,
      start,
      end,
      duration_minutes: durationMinutes(start, end, sorted),
      app,
      domain,
      project,
      resource,
      action: actionFor(kind),
      evidence_summary: summarizeEvidence(sorted),
    },
    confidence: confidenceForGroup(sorted, kind),
    stability: kind === "app_focus" ? "session" : "project",
    lossiness: "medium",
    privacy: { level: "private", retention: "normal", allow_embedding: true, allow_llm_summary: true, allow_external_llm: false },
    metadata: { generated_at: generatedAt, evidence_view_count: sourceViews.length },
  };
}

function buildProposalView(activity: ContextView | StoredContextView, generatedAt: string): ContextView | undefined {
  const kind = stringValue(activity.content?.kind);
  const proposed: Array<Record<string, unknown>> = [];
  const resource = isRecord(activity.content?.resource) ? activity.content.resource : undefined;
  const domain = stringValue(resource?.domain) ?? stringValue(activity.content?.domain);
  const duration = numberValue(activity.content?.duration_minutes) ?? 0;

  if (kind === "resource_consumption" && resource) {
    proposed.push({
      view_type: "resource",
      kind: learningDomain(domain) ? "learning_material" : "web_resource",
      priority: learningDomain(domain) ? 0.9 : 0.7,
      confidence: 0.85,
      cost: "low",
      decision: "materialize_now",
      reason: "continuous page activity with URL evidence",
    });
    proposed.push({
      view_type: "intent",
      kind: "candidate",
      priority: duration >= 5 ? 0.72 : 0.55,
      confidence: duration >= 5 ? 0.68 : 0.5,
      cost: "medium",
      decision: "defer_or_agent",
      reason: "resource consumption may indicate a learning or research goal",
    });
    proposed.push({
      view_type: "workflow",
      kind: learningDomain(domain) ? "learning_session" : "research_session",
      priority: duration >= 10 ? 0.62 : 0.42,
      confidence: duration >= 10 ? 0.58 : 0.45,
      cost: "medium",
      decision: duration >= 10 ? "defer_or_agent" : "defer",
      reason: "workflow needs supporting notes, searches, chat, or repeated activity",
    });
  }

  if (kind === "app_focus") {
    proposed.push({
      view_type: "intent",
      kind: "candidate",
      priority: 0.45,
      confidence: 0.45,
      cost: "medium",
      decision: "defer",
      reason: "app focus alone is weak evidence for intent",
    });
  }

  if (!proposed.length) return undefined;
  const start = stringValue(activity.content?.start) ?? activity.scope?.time_range?.start;
  const end = stringValue(activity.content?.end) ?? activity.scope?.time_range?.end;
  return {
    id: `proposal:view_proposal:${stableKey(`${activity.id}|${proposed.map(item => `${item.view_type}:${item.kind}`).join("|")}`)}`,
    view_type: "proposal",
    title: `View proposal: ${activity.title ?? kind ?? "activity"}`,
    summary: `ProposalView suggesting ${proposed.length} next View(s) from ActivityView ${activity.id}.`,
    status: "candidate",
    source_records: activity.source_records ?? [],
    source_views: activity.id ? [activity.id] : [],
    compiler: { id: PROPOSAL_VIEW_COMPILER_ID, version: "1", mode: "hybrid" },
    purpose: "Decide what Views should be materialized next from existing Views.",
    scope: {
      ...activity.scope,
      plugin_id: PROPOSAL_VIEW_COMPILER_ID,
      time_range: { start, end },
    },
    content: {
      kind: "view_proposal",
      hypothesis: proposalHypothesis(activity),
      scope: {
        start,
        end,
        apps: compactArray([stringValue(activity.content?.app)]),
        domains: compactArray([domain]),
      },
      proposed_views: proposed,
    },
    confidence: average(proposed.map(item => numberValue(item.confidence) ?? 0.5)),
    stability: "session",
    lossiness: "high",
    privacy: activity.privacy ?? { level: "private", retention: "normal", allow_external_llm: false },
    metadata: { generated_at: generatedAt, activity_kind: kind },
  };
}

function activityGroupKey(view: ContextView | StoredContextView): string | undefined {
  const kind = stringValue(view.content?.kind);
  const subject = subjectOf(view);
  if (kind === "page" && subject.url) return `page:${subject.url}`;
  if (kind === "focus") return `focus:${subject.app ?? ""}:${subject.window ?? ""}:${subject.url ?? ""}`;
  if (kind === "project" && subject.project) return `project:${subject.project}`;
  if (kind === "screen" || kind === "input" || kind === "selection") return `segment:${subject.app ?? ""}:${subject.domain ?? ""}:${subject.project ?? ""}`;
  return undefined;
}

function activityKindForGroup(group: Array<ContextView | StoredContextView>): string {
  const kinds = new Set(group.map(view => stringValue(view.content?.kind)));
  if (kinds.has("page")) return "resource_consumption";
  if (kinds.has("focus")) return "app_focus";
  if (kinds.has("project")) return "coding";
  return "segment";
}

function resourceOf(group: Array<ContextView | StoredContextView>): Record<string, unknown> | undefined {
  const page = group.find(view => stringValue(view.content?.kind) === "page" || stringValue(view.content?.kind) === "resource");
  if (!page) return undefined;
  const subject = subjectOf(page);
  if (!subject.url) return undefined;
  return {
    type: "url",
    url: subject.url,
    title: subject.title ?? page.title,
    domain: subject.domain,
  };
}

function summarizeEvidence(group: Array<ContextView | StoredContextView>): Record<string, unknown> {
  return {
    evidence_views: group.length,
    kinds: count(group.map(view => stringValue(view.content?.kind)).filter(isString)),
    origins: count(group.map(view => {
      const origin = isRecord(view.content?.origin) ? view.content.origin : {};
      return stringValue(origin.schema);
    }).filter(isString)),
    frame_ids: unique(group.flatMap(view => {
      const signals = isRecord(view.content?.signals) ? view.content.signals : {};
      return Array.isArray(signals.frame_ids) ? signals.frame_ids.map(String) : [];
    })).slice(0, 20),
  };
}

function confidenceForGroup(group: Array<ContextView | StoredContextView>, kind: string): number {
  const base = average(group.map(view => typeof view.confidence === "number" ? view.confidence : 0.65));
  const bonus = kind === "resource_consumption" && group.length > 1 ? 0.04 : 0;
  return Math.min(0.98, Number((base + bonus).toFixed(2)));
}

function durationMinutes(start: string, end: string, group: Array<ContextView | StoredContextView>): number {
  const explicitSeconds = group
    .map(view => {
      const signals = isRecord(view.content?.signals) ? view.content.signals : {};
      return numberValue(signals.duration_seconds);
    })
    .filter((value): value is number => value !== undefined);
  const explicit = explicitSeconds.length ? Math.max(...explicitSeconds) / 60 : 0;
  const range = (Date.parse(end) - Date.parse(start)) / 60_000;
  return Number(Math.max(explicit, Number.isFinite(range) ? range : 0).toFixed(2));
}

function actionFor(kind: string): string {
  if (kind === "resource_consumption") return "watching_or_reading";
  if (kind === "app_focus") return "using_app";
  if (kind === "coding") return "working_in_project";
  return "working_or_browsing";
}

function proposalHypothesis(activity: ContextView | StoredContextView): string {
  const kind = stringValue(activity.content?.kind) ?? "activity";
  if (kind === "resource_consumption") return "This activity may be worth turning into a ResourceView, IntentView, or WorkflowView.";
  if (kind === "app_focus") return "This focus interval may support intent inference if combined with stronger evidence.";
  return "This activity may be useful as supporting context for a higher-level View.";
}

function learningDomain(domain?: string): boolean {
  if (!domain) return false;
  return /youtube\.com|coursera\.org|edx\.org|arxiv\.org|github\.com|docs\.|wikipedia\.org/i.test(domain);
}

function observedAt(view: ContextView | StoredContextView): string {
  const contentObserved = stringValue(view.content?.observed_at);
  return contentObserved ?? view.scope?.time_range?.start ?? ("created_at" in view ? view.created_at : new Date().toISOString());
}

function subjectOf(view: ContextView | StoredContextView): Record<string, string | undefined> {
  if (isRecord(view.content?.subject)) {
    return {
      app: stringValue(view.content.subject.app),
      title: stringValue(view.content.subject.title),
      window: stringValue(view.content.subject.window),
      url: stringValue(view.content.subject.url),
      domain: stringValue(view.content.subject.domain),
      path: stringValue(view.content.subject.path),
      project: stringValue(view.content.subject.project),
    };
  }
  return {
    app: stringValue(view.content?.app),
    title: stringValue(view.content?.title) ?? view.title,
    url: stringValue(view.content?.url),
    domain: stringValue(view.content?.domain),
    path: stringValue(view.content?.path),
    project: stringValue(view.content?.project),
  };
}

function count(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}

function top(values: string[], limit: number): string[] {
  return Object.entries(count(values)).sort((a, b) => b[1] - a[1]).map(([value]) => value).slice(0, limit);
}

function compactArray(values: Array<string | undefined>): string[] {
  return values.filter(isString);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function stableKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
