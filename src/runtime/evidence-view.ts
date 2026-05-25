import { createHash } from "node:crypto";
import { basename } from "node:path";
import { ContextStore } from "../core/store.js";
import type { ContextView, StoredContextRecord, StoredContextView } from "../core/types.js";

export const EVIDENCE_VIEW_COMPILER_ID = "builtin.evidence-view";

export type CompileEvidenceViewsOptions = {
  minutes?: number;
  limit?: number;
  write?: boolean;
  records?: StoredContextRecord[];
  includeLowValue?: boolean;
};

export type CompileEvidenceViewsResult = {
  ok: true;
  compiler_id: string;
  generated_at: string;
  views: Array<ContextView | StoredContextView>;
  records_scanned: number;
  records_used: number;
};

export function compileEvidenceViews(options: CompileEvidenceViewsOptions = {}, store = new ContextStore()): CompileEvidenceViewsResult {
  const generatedAt = new Date().toISOString();
  const minutes = options.minutes ?? 240;
  const limit = options.limit ?? 300;
  const candidateLimit = options.records ? options.records.length : Math.max(limit * 3, limit + 50);
  const records = options.records ?? store.recent(candidateLimit, undefined, { minutes });
  const selected = records.filter(record => isEvidenceInputRecord(record, options)).slice(0, limit);
  const views = selected.map(record => buildEvidenceView(record, generatedAt, minutes));
  const shouldWrite = options.write ?? true;
  const stored = shouldWrite ? views.map(view => store.upsertView(view)) : views;

  if (shouldWrite) {
    store.appendRuntimeEvent({
      event_type: "view_compiled",
      actor: "system",
      status: "completed",
      subject_type: "view",
      plugin_id: EVIDENCE_VIEW_COMPILER_ID,
      related_records: selected.map(record => record.id),
      related_views: stored.map(view => view.id).filter(Boolean) as string[],
      payload: {
        view_type: "evidence.*",
        records_scanned: records.length,
        records_used: selected.length,
        views_compiled: stored.length,
        view_types: top(stored.map(view => view.view_type), 12),
      },
    });
  }

  return {
    ok: true,
    compiler_id: EVIDENCE_VIEW_COMPILER_ID,
    generated_at: generatedAt,
    views: stored,
    records_scanned: records.length,
    records_used: selected.length,
  };
}

export function buildEvidenceView(record: StoredContextRecord, generatedAt = new Date().toISOString(), minutes = 240): ContextView {
  const classification = classifyEvidence(record);
  const observedAt = record.time?.observed_at ?? record.created_at;
  const title = evidenceTitle(record, classification.viewType);
  const url = record.content?.url ?? stringValue(record.payload?.browser_url);
  const frameIds = frameIdsOf(record);
  const windowTitle = stringValue(record.payload?.window_name);
  const app = appOf(record);
  const domain = domainOf(record);
  const project = projectOf(record);
  const contentType = stringValue(record.payload?.content_type);

  return {
    id: `evidence:${classification.key}:${stableKey(record.id)}`,
    view_type: classification.viewType,
    title,
    summary: evidenceSummary(record, classification.viewType),
    status: "candidate",
    source_records: [record.id],
    compiler: { id: EVIDENCE_VIEW_COMPILER_ID, version: "1", mode: "deterministic" },
    purpose: "Normalize a raw Observation into a reusable evidence node with explicit attribution and provenance.",
    scope: {
      ...record.scope,
      app,
      domain,
      project,
      plugin_id: EVIDENCE_VIEW_COMPILER_ID,
      time_range: { start: observedAt, end: observedAt },
    },
    content: {
      evidence_kind: classification.key,
      observation_schema: record.schema.name,
      observation_source: sourceLabel(record),
      observed_at: observedAt,
      title,
      text: excerpt(record.content?.text ?? stringValue(record.payload?.text), 1200),
      url,
      path: record.content?.path,
      app,
      domain,
      project,
      project_path: record.scope?.project_path ?? stringValue(record.payload?.root) ?? stringValue(record.payload?.project_path),
      attribution: {
        source_type: record.source.type,
        connector: record.source.connector,
        reported_app: app,
        window_title: normalizeWindowTitle(windowTitle),
        reported_url: url,
        content_type: contentType,
        frame_id: frameIds[0],
        frame_ids: frameIds.length ? frameIds : undefined,
        interaction: interactionAttribution(record),
      },
      claims: evidenceClaims(record, classification.viewType),
      raw_keys: Object.keys(record.payload ?? {}).sort(),
    },
    confidence: classification.confidence,
    stability: classification.stability,
    lossiness: "low",
    privacy: record.privacy ?? { level: "private", retention: "normal", allow_external_llm: false },
    validity: {
      valid_from: observedAt,
      stale_after: classification.stability === "ephemeral"
        ? new Date(Date.parse(generatedAt) + Math.max(5, Math.min(minutes, 60)) * 60_000).toISOString()
        : undefined,
    },
    metadata: {
      generated_at: generatedAt,
      source_record_updated_at: record.updated_at,
      source_record_created_at: record.created_at,
      algorithm: "evidence-view-rules-v1",
    },
  };
}

function isEvidenceInputRecord(record: StoredContextRecord, options: CompileEvidenceViewsOptions): boolean {
  if (record.schema.name.startsWith("derived.")) return false;
  if (record.schema.name.startsWith("episode.")) return false;
  if (record.privacy?.retention === "do_not_store") return false;
  if (!options.includeLowValue && record.schema.name === "observation.browser_page_heartbeat" && !record.content?.url) return false;
  return true;
}

function classifyEvidence(record: StoredContextRecord): { key: string; viewType: string; confidence: number; stability: ContextView["stability"] } {
  const schema = record.schema.name;
  const contentType = stringValue(record.payload?.content_type)?.toLowerCase();
  if (schema === "observation.browser_text_selected") return { key: "text_selection", viewType: "evidence.text_selection", confidence: 0.92, stability: "session" };
  if (schema.startsWith("observation.browser_")) return { key: "browser_page", viewType: "evidence.browser_page", confidence: 0.9, stability: "session" };
  if (schema === "observation.screenpipe_activity_summary") return { key: "app_focus", viewType: "evidence.app_focus", confidence: 0.78, stability: "ephemeral" };
  if (schema === "observation.screenpipe_input_event") return { key: "ui_interaction", viewType: "evidence.ui_interaction", confidence: 0.82, stability: "ephemeral" };
  if (schema === "observation.screenpipe_workspace_signal" && contentType === "element") return { key: "ui_element", viewType: "evidence.ui_element", confidence: 0.72, stability: "ephemeral" };
  if (schema === "observation.screenpipe_workspace_signal" || schema === "observation.screenpipe_activity") return { key: "screen_frame", viewType: "evidence.screen_frame", confidence: 0.68, stability: "ephemeral" };
  if (schema === "observation.local_project") return { key: "local_project", viewType: "evidence.local_project", confidence: 0.95, stability: "project" };
  if (schema.includes("ai_session")) return { key: "agent_session", viewType: "evidence.agent_session", confidence: 0.86, stability: "session" };
  if (schema.includes("terminal") || record.source.type === "terminal") return { key: "terminal_event", viewType: "evidence.terminal_event", confidence: 0.86, stability: "session" };
  if (record.content?.url) return { key: "resource", viewType: "evidence.resource", confidence: 0.82, stability: "session" };
  return { key: "observation", viewType: "evidence.observation", confidence: record.signal?.confidence ?? 0.65, stability: "session" };
}

function evidenceTitle(record: StoredContextRecord, viewType: string): string {
  if (viewType === "evidence.app_focus") {
    return [appOf(record), normalizeWindowTitle(stringValue(record.payload?.window_name))].filter(Boolean).join(" - ") || "Focused app evidence";
  }
  if (viewType === "evidence.screen_frame") return record.content?.title ?? "Screen frame evidence";
  if (viewType === "evidence.ui_interaction") return record.content?.title ?? `${appOf(record) ?? "App"} interaction`;
  if (viewType === "evidence.local_project") return record.content?.title ?? `Local project: ${projectOf(record) ?? "unknown"}`;
  return record.content?.title ?? record.content?.url ?? record.content?.path ?? record.schema.name;
}

function evidenceSummary(record: StoredContextRecord, viewType: string): string {
  const title = evidenceTitle(record, viewType);
  const source = sourceLabel(record);
  const observedAt = record.time?.observed_at ?? record.created_at;
  return `${viewType} from ${source} at ${observedAt}: ${title}`;
}

function evidenceClaims(record: StoredContextRecord, viewType: string): Array<Record<string, unknown>> {
  const observedAt = record.time?.observed_at ?? record.created_at;
  const claims: Array<Record<string, unknown>> = [];
  const url = record.content?.url ?? stringValue(record.payload?.browser_url);
  const app = appOf(record);
  const domain = domainOf(record);
  const text = excerpt(record.content?.text ?? stringValue(record.payload?.text), 280);
  if (url) claims.push({ kind: "url_seen", value: url, domain, observed_at: observedAt });
  if (app) claims.push({ kind: viewType === "evidence.app_focus" ? "app_focused" : "app_reported", value: app, observed_at: observedAt });
  if (text) claims.push({ kind: viewType === "evidence.screen_frame" ? "text_visible" : "text_observed", value: text, observed_at: observedAt });
  if (record.content?.path) claims.push({ kind: "path_seen", value: record.content.path, observed_at: observedAt });
  if (viewType === "evidence.ui_interaction") {
    const interaction = interactionAttribution(record);
    if (interaction.event_type) claims.push({ kind: "ui_event", value: interaction.event_type, role: interaction.element_role, name: interaction.element_name, observed_at: observedAt });
  }
  return claims;
}

function interactionAttribution(record: StoredContextRecord): Record<string, unknown> {
  const rawResult = record.payload?.raw_result as Record<string, unknown> | undefined;
  const rawContent = rawResult?.content as Record<string, unknown> | undefined;
  return {
    event_type: stringValue(record.payload?.event_type) ?? stringValue(rawResult?.event_type) ?? stringValue(rawContent?.event_type),
    element_role: stringValue(rawContent?.element_role) ?? stringValue(record.payload?.role),
    element_name: stringValue(rawContent?.element_name),
  };
}

function appOf(record: StoredContextRecord): string | undefined {
  return record.scope?.app ?? stringValue(record.payload?.app_name) ?? stringValue(record.payload?.app);
}

function projectOf(record: StoredContextRecord): string | undefined {
  return record.scope?.project ?? stringValue(record.payload?.project) ?? basename(stringValue(record.payload?.root) ?? record.scope?.project_path ?? record.content?.path ?? "");
}

function domainOf(record: StoredContextRecord): string | undefined {
  if (record.scope?.domain) return record.scope.domain;
  const url = record.content?.url ?? stringValue(record.payload?.browser_url);
  if (!url) return undefined;
  try { return new URL(url).hostname; } catch { return undefined; }
}

function frameIdsOf(record: StoredContextRecord): Array<string | number> {
  const out: Array<string | number> = [];
  const frameIds = record.payload?.frame_ids;
  if (Array.isArray(frameIds)) {
    for (const frameId of frameIds) {
      if (typeof frameId === "string" || typeof frameId === "number") out.push(frameId);
    }
  }
  const frameId = record.payload?.frame_id;
  if (typeof frameId === "string" || typeof frameId === "number") out.push(frameId);
  return [...new Map(out.map(value => [String(value), value])).values()];
}

function sourceLabel(record: StoredContextRecord): string {
  return `${record.source.type}${record.source.connector ? `/${record.source.connector}` : ""}`;
}

function top(values: string[], limit: number): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count })).slice(0, limit);
}

function excerpt(text: string | undefined, max: number): string | undefined {
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.length <= max ? normalized : `${normalized.slice(0, max)}...`;
}

function normalizeWindowTitle(title?: string): string | undefined {
  if (!title) return undefined;
  const normalized = title
    .replace(/^[\s|/\\\-]+/u, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || title.trim() || undefined;
}

function stableKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
