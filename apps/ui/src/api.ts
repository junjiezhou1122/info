import type { ActivityTimelineResponse, ContextViewSummary, FeedbackResponse, MemoryCandidateContent, MemoryGateDecision, ProjectCurrentContent, ProcessorRun, RuntimeSettings, RuntimeSettingsResponse, RuntimeTickResponse, ViewCatalogResponse, ViewFamiliesResponse, ViewListResponse, WorkFocusSetContent } from "./types";

const API_BASE = import.meta.env.VITE_CONTEXT_API_BASE ?? "http://localhost:3111";
const DEFAULT_TIMEOUT_MS = 8_000;

export function screenpipeFrameUrl(frameId: string | number): string {
  return `${API_BASE}/screenpipe/frames/${encodeURIComponent(String(frameId))}`;
}

export async function syncScreenpipe(windowMinutes = 15): Promise<RuntimeTickResponse> {
  const res = await fetchWithTimeout(`${API_BASE}/runtime/tick`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      include_screenpipe: true,
      include_ai_sessions: false,
      include_git: false,
      force: true,
      window_minutes: windowMinutes,
      compile_views: false,
      screenpipe_limit: 60,
    }),
  }, 12_000);
  if (!res.ok) throw new Error(`screenpipe sync failed: ${res.status}`);
  return res.json();
}

export async function runRuntimeTick(body: Record<string, unknown>): Promise<RuntimeTickResponse> {
  const res = await fetchWithTimeout(`${API_BASE}/runtime/tick`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, 180_000);
  if (!res.ok) throw new Error(`runtime tick failed: ${res.status}`);
  return res.json();
}

export async function fetchRuntimeSettings(): Promise<RuntimeSettingsResponse> {
  const res = await fetchWithTimeout(`${API_BASE}/runtime/settings`, undefined, 8_000);
  if (!res.ok) throw new Error(`runtime settings fetch failed: ${res.status}`);
  return res.json();
}

export async function saveRuntimeSettings(settings: RuntimeSettings): Promise<RuntimeSettingsResponse> {
  const res = await fetchWithTimeout(`${API_BASE}/runtime/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  }, 12_000);
  if (!res.ok) throw new Error(`runtime settings save failed: ${res.status}`);
  return res.json();
}

export async function fetchActivityTimeline(options: { minutes?: number; limit?: number; bucketMinutes?: number; includeLowLevelScreenpipe?: boolean; dedupe?: boolean; bucketItemLimit?: number | false; summarizeHeartbeats?: boolean; sourceFilter?: "screenpipe" | "browser" | "runtime" | "all"; mergeContinuous?: boolean; mergeGapMinutes?: number } = {}): Promise<ActivityTimelineResponse> {
  const minutes = options.minutes ?? 180;
  const sourceFilter = options.sourceFilter ?? "all";
  const debugMode = options.includeLowLevelScreenpipe === true;
  const res = await fetchWithTimeout(`${API_BASE}/timeline/activity/compile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      minutes,
      limit: options.limit ?? timelineRecordLimit(minutes, sourceFilter),
      bucket_minutes: options.bucketMinutes ?? 10,
      include_low_level_screenpipe: options.includeLowLevelScreenpipe ?? false,
      include_runtime_events: false,
      dedupe: options.dedupe ?? !debugMode,
      bucket_item_limit: options.bucketItemLimit ?? (debugMode ? false : 50),
      summarize_heartbeats: options.summarizeHeartbeats ?? !debugMode,
      source_filter: sourceFilter,
      merge_continuous: options.mergeContinuous ?? true,
      merge_gap_minutes: options.mergeGapMinutes ?? 3,
      write: false,
    }),
  });
  if (!res.ok) throw new Error(`timeline compile failed: ${res.status}`);
  return res.json();
}

export async function fetchViewFamilies(): Promise<ViewFamiliesResponse> {
  const catalog = await fetchViewCatalog();
  const familyOrder = catalog.order;
  const res = await fetchWithTimeout(`${API_BASE}/context/views/families?view_types=${familyOrder.join(",")}&active_only=true`, undefined, 8_000);
  if (!res.ok) throw new Error(`view families fetch failed: ${res.status}`);
  const body = await res.json();
  const returned = Array.isArray(body.families) ? body.families : [];
  const byFamily = new Map(returned.map((family: any) => [family.family, family]));
  const byDefinition = new Map(catalog.families.map(family => [family.view_type, family]));
  const families = familyOrder.map(family => {
    const item = byFamily.get(family) as any;
    return {
      family,
      count: Number(item?.count ?? 0),
      kinds: Array.isArray(item?.kinds) ? item.kinds : [],
      latest: item?.latest,
      definition: item?.definition ?? byDefinition.get(family),
    };
  });
  const views = families.map(family => family.latest).filter(Boolean) as ContextViewSummary[];
  return { ok: true, views, families, catalog };
}

export async function fetchViewCatalog(): Promise<ViewCatalogResponse> {
  const res = await fetchWithTimeout(`${API_BASE}/context/views/catalog`, undefined, 8_000);
  if (!res.ok) throw new Error(`view catalog fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchViewsByType(viewType: string, options: { limit?: number; cursor?: string } = {}): Promise<ViewListResponse> {
  const params = new URLSearchParams({
    view_types: viewType,
    limit: String(options.limit ?? 80),
    active_only: "true",
    summary_only: "true",
  });
  if (options.cursor) params.set("updated_after", options.cursor);
  const res = await fetchWithTimeout(`${API_BASE}/context/views?${params.toString()}`, undefined, 8_000);
  if (!res.ok) throw new Error(`${viewType} views fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchViewsByTypes(viewTypes: string[], options: { limit?: number } = {}): Promise<ViewListResponse> {
  const params = new URLSearchParams({
    view_types: viewTypes.join(","),
    limit: String(options.limit ?? 120),
    active_only: "true",
    summary_only: "true",
  });
  const res = await fetchWithTimeout(`${API_BASE}/context/views?${params.toString()}`, undefined, 8_000);
  if (!res.ok) throw new Error(`ambient views fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchContextView(viewId: string): Promise<ContextViewSummary> {
  const res = await fetchWithTimeout(`${API_BASE}/context/views/${encodeURIComponent(viewId)}`);
  if (!res.ok) throw new Error(`view fetch failed: ${res.status}`);
  const body = await res.json();
  return body.view;
}

export async function submitViewFeedback(input: { view_id: string; type: "analysis.useful" | "analysis.dismissed" | "output.edited"; value?: unknown; reason?: string; payload?: Record<string, unknown> }): Promise<FeedbackResponse> {
  const res = await fetchWithTimeout(`${API_BASE}/feedback?process=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      application_id: "runtime.ui.ambient",
      privacy: { level: "private", retention: "normal" },
      ...input,
    }),
  }, 12_000);
  if (!res.ok) throw new Error(`feedback failed: ${res.status}`);
  return res.json();
}

export async function fetchMemoryCandidates(): Promise<ContextViewSummary[]> {
  const res = await fetchWithTimeout(`${API_BASE}/context/views?view_types=memory.candidate&active_only=true&limit=160`, undefined, 8_000);
  if (!res.ok) throw new Error(`memory candidates fetch failed: ${res.status}`);
  const body = await res.json();
  return (body.views ?? []) as ContextViewSummary[];
}

export async function fetchMemoryGateViews(): Promise<ContextViewSummary[]> {
  const res = await fetchWithTimeout(`${API_BASE}/context/views?view_types=memory.gate&active_only=true&limit=80`, undefined, 8_000);
  if (!res.ok) throw new Error(`memory gate fetch failed: ${res.status}`);
  const body = await res.json();
  return (body.views ?? []) as ContextViewSummary[];
}

export async function fetchProjectCurrentViews(): Promise<ContextViewSummary[]> {
  const res = await fetchWithTimeout(`${API_BASE}/context/views?view_types=project.current,project.current_context&active_only=true&limit=40`, undefined, 8_000);
  if (!res.ok) throw new Error(`project.current fetch failed: ${res.status}`);
  const body = await res.json();
  return ((body.views ?? []) as ContextViewSummary[]).sort((a, b) => {
    if (a.view_type === b.view_type) return Date.parse(b.updated_at ?? "") - Date.parse(a.updated_at ?? "");
    if (a.view_type === "project.current") return -1;
    if (b.view_type === "project.current") return 1;
    return a.view_type.localeCompare(b.view_type);
  });
}

export async function fetchWorkFocusSetViews(): Promise<ContextViewSummary[]> {
  const res = await fetchWithTimeout(`${API_BASE}/context/views?view_types=work.focus_set&active_only=true&limit=20`, undefined, 8_000);
  if (!res.ok) throw new Error(`work.focus_set fetch failed: ${res.status}`);
  const body = await res.json();
  return (body.views ?? []) as ContextViewSummary[];
}

export async function fetchProcessorTraces(): Promise<Array<{
  id: string;
  event_type: string;
  actor: string;
  status: string;
  subject_type: string;
  subject_id: string;
  payload?: Record<string, unknown>;
  created_at: string;
}>> {
  const res = await fetchWithTimeout(`${API_BASE}/runtime/events?types=processor.run.started,processor.run.completed,processor.run.failed&limit=120`, undefined, 8_000);
  if (!res.ok) throw new Error(`processor traces fetch failed: ${res.status}`);
  const body = await res.json();
  return (body.events ?? []) as Array<{
    id: string;
    event_type: string;
    actor: string;
    status: string;
    subject_type: string;
    subject_id: string;
    payload?: Record<string, unknown>;
    created_at: string;
  }>;
}

export async function fetchProactiveSuggestions(): Promise<ContextViewSummary[]> {
  const res = await fetchWithTimeout(`${API_BASE}/context/views?view_types=advice.research,draft.writing_continuation,opportunity.tool,draft.tool_prototype&active_only=true&limit=80`, undefined, 8_000);
  if (!res.ok) throw new Error(`proactive suggestions fetch failed: ${res.status}`);
  const body = await res.json();
  return (body.views ?? []) as ContextViewSummary[];
}

export async function patchViewStatus(
  viewId: string,
  status: "active" | "candidate" | "archived" | "rejected",
): Promise<ContextViewSummary> {
  const res = await fetchWithTimeout(`${API_BASE}/context/views/${encodeURIComponent(viewId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  }, 8_000);
  if (!res.ok) throw new Error(`view patch failed: ${res.status}`);
  const body = await res.json();
  return body.view as ContextViewSummary;
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error(`request timed out after ${Math.round(timeoutMs / 1000)}s`);
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function timelineRecordLimit(minutes: number, sourceFilter: "screenpipe" | "browser" | "runtime" | "all") {
  const samplesPerMinute = sourceFilter === "runtime" ? 2 : sourceFilter === "browser" ? 10 : sourceFilter === "screenpipe" ? 12 : 16;
  const minimum = sourceFilter === "runtime" ? 200 : 900;
  return Math.min(12_000, Math.max(minimum, Math.ceil(minutes * samplesPerMinute)));
}
