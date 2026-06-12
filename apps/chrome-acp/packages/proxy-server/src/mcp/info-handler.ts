// Info context tool handler — forwards tool calls to the local info
// context-layer HTTP server (default http://localhost:3111).
//
// Info tools implemented:
//   - info_search_context   → POST /context/query
//   - info_list_views       → GET  /context/views
//   - info_get_view         → GET  /context/views/:id
//   - info_submit_feedback  → POST /feedback
//
// All requests go through Node's built-in fetch (Node 18+). Failures are
// returned as McpToolCallResult with isError=true so the agent can react.

import { log } from "../logger.js";
import {
  DEFAULT_INFO_CONTEXT_BASE_URL,
  type McpToolCallParams,
  type McpToolCallResult,
} from "./types.js";

function infoBaseUrl(): string {
  return (process.env.INFO_CONTEXT_BASE_URL ?? DEFAULT_INFO_CONTEXT_BASE_URL).replace(/\/+$/, "");
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  return undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((v): v is string => typeof v === "string" && Boolean(v.trim()));
  return items.length ? items : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return undefined;
}

function textResult(text: string, isError = false): McpToolCallResult {
  return {
    content: [{ type: "text", text }],
    isError,
  };
}

function errorResult(message: string): McpToolCallResult {
  return textResult(`info context error: ${message}`, true);
}

async function postJson<T>(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: T | string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let data: T | string = text;
    try {
      data = text ? (JSON.parse(text) as T) : ({} as T);
    } catch {
      // leave as raw text
    }
    return { ok: response.ok, status: response.status, data };
  } finally {
    clearTimeout(timeout);
  }
}

async function getJson<T>(url: string): Promise<{ ok: boolean; status: number; data: T | string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    let data: T | string = text;
    try {
      data = text ? (JSON.parse(text) as T) : ({} as T);
    } catch {
      // leave as raw text
    }
    return { ok: response.ok, status: response.status, data };
  } finally {
    clearTimeout(timeout);
  }
}

function renderPackMarkdown(pack: unknown): string {
  if (!pack || typeof pack !== "object") return JSON.stringify(pack, null, 2);
  const anyPack = pack as Record<string, unknown>;
  if (typeof anyPack.markdown === "string" && anyPack.markdown.trim()) return anyPack.markdown;
  return JSON.stringify(pack, null, 2);
}

const VIEW_FAMILY_TYPES: Record<string, string[] | undefined> = {
  related: [
    "analysis.browser_page",
    "analysis.browser_agent_task",
    "project.current_context",
    "thread.active_work",
    "brief.project_next_state",
    "brief.research",
    "brief.background_research",
    "advice.research",
    "advice.writing_assist",
    "task.background_research",
    "draft.writing_continuation",
    "opportunity.tool",
    "task.toolsmith_prototype",
    "draft.tool_prototype",
    "tool.prototype_artifact",
    "app.language.learning_pack",
    "app.language.review_queue",
    "memory.language.vocabulary_exposure",
    "memory.language.difficult_segments",
  ],
  analyze: ["analysis.browser_page", "analysis.browser_agent_task", "analysis.repo"],
  task: ["task.background_research", "task.browser_ambient", "task.toolsmith_prototype"],
  language: [
    "app.language.learning_pack",
    "app.language.review_queue",
    "memory.language.vocabulary_exposure",
    "memory.language.difficult_segments",
  ],
  writing: ["advice.writing_assist", "draft.writing_continuation"],
  tool: ["opportunity.tool", "task.toolsmith_prototype", "draft.tool_prototype", "tool.prototype_artifact"],
  project: ["project.current_context", "thread.active_work", "brief.project_next_state", "memory.project.patterns"],
  all: undefined,
};

function clampLimit(value: number | undefined, fallback: number): number {
  if (!value || value <= 0) return fallback;
  return Math.max(1, Math.min(50, Math.floor(value)));
}

function truncate(text: string, max = 420): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function pickStringArray(record: Record<string, unknown>, keys: string[], max = 5): string[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value
        .map(item => typeof item === "string" ? item : typeof item === "object" && item ? JSON.stringify(item) : "")
        .filter(Boolean)
        .slice(0, max);
    }
  }
  return [];
}

function renderViewLine(view: Record<string, unknown>, index: number): string {
  const id = typeof view.id === "string" ? view.id : "(no id)";
  const type = typeof view.view_type === "string" ? view.view_type : "view";
  const title = typeof view.title === "string" && view.title.trim() ? view.title.trim() : id;
  const updatedAt = typeof view.updated_at === "string" ? view.updated_at : undefined;
  const status = typeof view.status === "string" ? view.status : undefined;
  const content = view.content && typeof view.content === "object" && !Array.isArray(view.content)
    ? view.content as Record<string, unknown>
    : {};
  const summary = pickString(view, ["summary"]) ?? pickString(content, [
    "summary",
    "analysis",
    "advice",
    "goal",
    "text",
    "draft_text",
    "recommendation",
  ]);
  const keyPoints = pickStringArray(content, ["key_points", "keyPoints", "takeaways", "next_actions", "suggestions", "focus_words"], 4);
  const details = [
    typeof view.confidence === "number" ? `confidence ${Math.round(view.confidence * 100)}%` : undefined,
    status ? `status ${status}` : undefined,
    updatedAt ? `updated ${updatedAt}` : undefined,
  ].filter(Boolean).join("; ");

  const lines = [
    `## ${index + 1}. ${type}: ${title}`,
    `- view_id: ${id}`,
    details ? `- meta: ${details}` : undefined,
    summary ? `- summary: ${truncate(summary)}` : undefined,
    keyPoints.length ? `- key_points: ${keyPoints.map(point => truncate(point, 160)).join(" | ")}` : undefined,
  ];
  return lines.filter(Boolean).join("\n");
}

function renderViewsMarkdown(payload: unknown, request: { family?: string; query?: string; viewTypes?: string[]; prefix?: string }): string {
  if (!payload || typeof payload !== "object") return JSON.stringify(payload, null, 2);
  const data = payload as Record<string, unknown>;
  const views = Array.isArray(data.views) ? data.views.filter((view): view is Record<string, unknown> => Boolean(view) && typeof view === "object" && !Array.isArray(view)) : [];
  const titleParts = [
    request.family ? `family=${request.family}` : undefined,
    request.viewTypes?.length ? `types=${request.viewTypes.join(",")}` : undefined,
    request.prefix ? `prefix=${request.prefix}` : undefined,
    request.query ? `query="${request.query}"` : undefined,
  ].filter(Boolean).join(" ");
  const header = [`# Info Views`, titleParts ? `Filters: ${titleParts}` : undefined, `Returned ${views.length} view(s).`].filter(Boolean).join("\n");
  if (!views.length) return `${header}\n\nNo matching active Info Views found.`;
  const nextCursor = typeof data.next_cursor === "string" ? `\n\nnext_cursor: ${data.next_cursor}` : "";
  return `${header}\n\n${views.map(renderViewLine).join("\n\n")}${nextCursor}`;
}

async function handleSearchContext(args: Record<string, unknown> | undefined): Promise<McpToolCallResult> {
  const query = asString(args?.query);
  if (!query) return errorResult("query is required");

  const body: Record<string, unknown> = {
    query,
    include_records: true,
    include_views: true,
    include_events: false,
  };
  const viewTypes = asStringArray(args?.view_types);
  if (viewTypes) body.view_types = viewTypes;
  const minutes = asNumber(args?.minutes);
  if (minutes) body.time_window = { minutes };
  const limit = asNumber(args?.limit);
  if (limit) body.limit = limit;

  const url = `${infoBaseUrl()}/context/query`;
  log.info("info_search_context → POST /context/query", { url, query });
  const { ok, status, data } = await postJson<{ ok?: boolean; pack?: unknown; error?: unknown }>(url, body);
  if (!ok) {
    const detail = typeof data === "string" ? data : JSON.stringify(data);
    return errorResult(`HTTP ${status}: ${detail.slice(0, 600)}`);
  }
  if (typeof data === "object" && data && data.ok === false) {
    return errorResult(`info returned ok=false: ${JSON.stringify(data.error ?? data).slice(0, 600)}`);
  }
  const pack = (data && typeof data === "object" && "pack" in data) ? (data as { pack?: unknown }).pack : data;
  return textResult(renderPackMarkdown(pack));
}

async function handleListViews(args: Record<string, unknown> | undefined): Promise<McpToolCallResult> {
  const family = asString(args?.family);
  const query = asString(args?.query);
  const explicitTypes = asStringArray(args?.view_types);
  const familyTypes = family ? VIEW_FAMILY_TYPES[family] : VIEW_FAMILY_TYPES.related;
  const viewTypes = explicitTypes ?? familyTypes;
  const prefix = asString(args?.view_type_prefix);
  const activeOnly = asBoolean(args?.active_only) ?? true;
  const limit = clampLimit(asNumber(args?.limit), 12);

  const url = new URL(`${infoBaseUrl()}/context/views`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("summary_only", "true");
  if (activeOnly) url.searchParams.set("active_only", "true");
  if (viewTypes?.length) url.searchParams.set("view_types", viewTypes.join(","));
  if (!viewTypes?.length && prefix) url.searchParams.set("view_type_prefix", prefix);
  if (query) url.searchParams.set("query", query);
  const updatedAfter = asString(args?.updated_after);
  if (updatedAfter) url.searchParams.set("updated_after", updatedAfter);

  log.info("info_list_views → GET /context/views", { url: url.toString(), family, query, viewTypes, prefix });
  const { ok, status, data } = await getJson<{ ok?: boolean; views?: unknown[]; error?: unknown }>(url.toString());
  if (!ok) {
    const detail = typeof data === "string" ? data : JSON.stringify(data);
    return errorResult(`HTTP ${status}: ${detail.slice(0, 600)}`);
  }
  if (typeof data === "object" && data && data.ok === false) {
    return errorResult(`info returned ok=false: ${JSON.stringify(data.error ?? data).slice(0, 600)}`);
  }
  return textResult(renderViewsMarkdown(data, { family, query, viewTypes, prefix }));
}

async function handleGetView(args: Record<string, unknown> | undefined): Promise<McpToolCallResult> {
  const viewId = asString(args?.view_id);
  if (!viewId) return errorResult("view_id is required");

  const url = `${infoBaseUrl()}/context/views/${encodeURIComponent(viewId)}`;
  log.info("info_get_view → GET /context/views/:id", { url });
  const { ok, status, data } = await getJson<{ ok?: boolean; view?: unknown; error?: unknown }>(url);
  if (!ok) {
    if (status === 404) return errorResult(`view not found: ${viewId}`);
    const detail = typeof data === "string" ? data : JSON.stringify(data);
    return errorResult(`HTTP ${status}: ${detail.slice(0, 600)}`);
  }
  if (typeof data === "object" && data && data.ok === false) {
    return errorResult(`info returned ok=false: ${JSON.stringify(data.error ?? data).slice(0, 600)}`);
  }
  const view = (data && typeof data === "object" && "view" in data) ? (data as { view?: unknown }).view : data;
  return textResult(renderPackMarkdown(view));
}

async function handleSubmitFeedback(args: Record<string, unknown> | undefined): Promise<McpToolCallResult> {
  const type = asString(args?.type);
  const applicationId = asString(args?.application_id);
  if (!type) return errorResult("type is required");
  if (!applicationId) return errorResult("application_id is required");

  const viewId = asString(args?.view_id);
  const recordId = asString(args?.record_id);
  if (!viewId && !recordId) return errorResult("view_id or record_id is required");

  const body: Record<string, unknown> = {
    type,
    application_id: applicationId,
  };
  if (viewId) body.view_id = viewId;
  if (recordId) body.record_id = recordId;
  if (args?.value !== undefined) body.value = args.value;
  const reason = asString(args?.reason);
  if (reason) body.reason = reason;
  if (args?.payload && typeof args.payload === "object") body.payload = args.payload;

  const url = `${infoBaseUrl()}/feedback`;
  log.info("info_submit_feedback → POST /feedback", { url, type, viewId, recordId });
  const { ok, status, data } = await postJson<{ ok?: boolean; error?: unknown }>(url, body);
  if (!ok) {
    const detail = typeof data === "string" ? data : JSON.stringify(data);
    return errorResult(`HTTP ${status}: ${detail.slice(0, 600)}`);
  }
  if (typeof data === "object" && data && data.ok === false) {
    return errorResult(`info returned ok=false: ${JSON.stringify(data.error ?? data).slice(0, 600)}`);
  }
  return textResult(JSON.stringify(data, null, 2));
}

export async function executeInfoTool(params: McpToolCallParams): Promise<McpToolCallResult> {
  const args = (params.arguments ?? {}) as Record<string, unknown>;
  try {
    switch (params.name) {
      case "info_search_context":
        return await handleSearchContext(args);
      case "info_list_views":
        return await handleListViews(args);
      case "info_get_view":
        return await handleGetView(args);
      case "info_submit_feedback":
        return await handleSubmitFeedback(args);
      default:
        return errorResult(`unknown info tool: ${params.name}`);
    }
  } catch (error) {
    log.error("info tool call failed", { tool: params.name, error: (error as Error).message });
    return errorResult((error as Error).message);
  }
}
