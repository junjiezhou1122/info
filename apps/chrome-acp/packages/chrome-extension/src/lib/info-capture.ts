const DEFAULT_SETTINGS = {
  endpoint: "http://localhost:3111/context/ingest",
  captureStream: true,
  heartbeatSeconds: 15,
  snapshotOnVisit: true,
  allowExternalLlm: true,
  snapshotTextLimit: 120000,
  excludedDomains: [
    "gmail.com",
    "mail.google.com",
    "icloud.com",
    "1password.com",
    "bitwarden.com",
    "paypal.com",
    "stripe.com",
  ],
};

type InfoSettings = typeof DEFAULT_SETTINGS;

type PageContext = {
  title?: string;
  url?: string;
  domain?: string;
  text?: string;
  selected_text?: string;
  scroll_depth?: number;
  scroll_events?: number;
  selection_count?: number;
  observed_at?: string;
  metadata?: Record<string, unknown>;
  text_quality?: Record<string, unknown>;
  search?: { engine?: string; query?: string; searched_at?: string };
};

type TabState = {
  tabId: number;
  windowId?: number;
  url: string;
  domain: string;
  visitId: string;
  openedAt: string;
  startedAt: number;
  activatedAt: number;
  visitRecorded: boolean;
  snapshotCount: number;
  lastSnapshotAt: number;
  settings: InfoSettings;
  title?: string;
  privacy?: Record<string, unknown>;
};

const tabState = new Map<number, TabState>();

export async function installInfoCaptureDefaults() {
  const keys = Object.keys(DEFAULT_SETTINGS) as Array<keyof InfoSettings>;
  const existing = await chrome.storage.local.get(keys);
  await chrome.storage.local.set({ ...DEFAULT_SETTINGS, ...existing });
}

export function startInfoCapture() {
  chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    const tab = await chrome.tabs.get(tabId).catch(() => undefined);
    if (tab?.id && tab.url) await ensureVisit(tab, "tab_activated");
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" || changeInfo.url) {
      if (tab?.id && tab.url) await ensureVisit(tab, "page_loaded");
    }
  });

  chrome.tabs.onRemoved.addListener(async (tabId) => {
    const state = tabState.get(tabId);
    if (state) {
      await sendLifecycleEvent(state, "tab_closed").catch(() => undefined);
      tabState.delete(tabId);
    }
  });

  setInterval(async () => {
    const settings = await getSettings();
    if (!settings.captureStream) return;
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
    for (const tab of tabs) {
      if (!tab?.id || !tab.url) continue;
      await ensureVisit(tab, "heartbeat_tick");
      await captureHeartbeat(tab).catch(() => undefined);
    }
  }, DEFAULT_SETTINGS.heartbeatSeconds * 1000);
}

export async function handleInfoCaptureMessage(message: any, sender: chrome.runtime.MessageSender) {
  if (message?.type === "context.capture.browser_attention") {
    const tab = sender.tab ?? await getActiveTab();
    return sendBrowserAttention(message.payload, message.kind, tab);
  }
  if (message?.type === "context.explain.selection") {
    const tab = sender.tab ?? await getActiveTab();
    return explainSelection(message.payload, tab);
  }
  if (message?.type === "context.capture.writing_input") {
    const tab = sender.tab ?? await getActiveTab();
    return sendWritingInput(message.payload, tab);
  }
  if (message?.type === "save-current-page") {
    const tab = await getActiveTab();
    return captureSnapshot(tab, "manual_save", true, message.reason);
  }
  if (message?.type === "ambient-current-page") {
    const tab = await getActiveTab();
    return captureAmbientRequest(tab, message.reason || "Explore current page with Browser Ambient");
  }
  if (message?.type === "feedback-view") {
    return postViewFeedback(message);
  }
  if (message?.type === "poll-context-views") {
    return pollContextViews(message);
  }
  if (message?.type === "list-ambient-tasks") {
    if (shouldUseAgentTasksEndpoint(message)) return pollAgentTasks(message);
    // Browser-side shorthand: list views that look like ambient task outputs.
    // We filter on view type prefixes produced by program.browser_ambient
    // (analysis.*) and the proactive ambient programs (advice.* / task.*).
    return pollContextViews({
      viewTypes: message.viewTypes,
      viewTypePrefix: message.viewTypePrefix ?? "analysis.",
      cursor: message.cursor,
      query: message.query,
      sourceRecordId: message.sourceRecordId,
      limit: message.limit ?? 30,
      activeOnly: message.activeOnly ?? false,
    });
  }
  if (message?.type === "agent-tasks") {
    return runAgentTasksAction(message);
  }
  if (message?.type === "agent-task-action") {
    return updateAgentTask(message);
  }
  if (message?.type === "trigger-ambient") {
    // Fire-and-forget ambient request for the current tab. Used by both
    // the side-panel "Analyze" button and the silent dwell trigger.
    const tab = await getActiveTab();
    return captureAmbientRequest(tab, message.reason || "Ambient analysis requested");
  }
  if (message?.type === "youtube-comprehension-gap") {
    // Ingest a single comprehension gap record produced by the YouTube
    // content script. We process it through the cascade so the
    // language_learning program can pick it up in the same tick.
    const tab = sender.tab ?? await getActiveTab();
    if (!tab?.id || !tab.url) return { ok: false, error: "no active tab" };
    const gap = message.gap;
    if (!gap?.video_id) return { ok: false, error: "gap missing video_id" };
    await ensureVisit(tab, "youtube_comprehension_gap");
    const state = getTabState(tab.id, tab.url);
    state.windowId = tab.windowId;
    state.settings = await getSettings();
    const page = await collectFromTab(tab.id).catch(() => basicPageFromTab(tab));
    const record = baseRecord({
      schemaName: "observation.youtube.comprehension_gap",
      page,
      state,
      contentText: undefined,
      acquisitionMode: "passive",
      reason: "User toggled captions repeatedly on a YouTube segment; treating it as a comprehension gap",
      importance: 0.7,
      payload: {
        gap,
        visit_id: state.visitId,
      },
    });
    return postRecord(record, { process: true, cascadeViews: true });
  }
  if (message?.type === "youtube-observation") {
    const tab = sender.tab ?? await getActiveTab();
    return sendYouTubeObservation(message, tab);
  }
  if (message?.type === "get-current-status") {
    const tab = await getActiveTab();
    if (tab?.id && tab.url) await ensureVisit(tab, "status_check");
    return { ok: true, tab, state: tab?.id ? summarizeState(tabState.get(tab.id)) : undefined, settings: await getSettings() };
  }
  if (message?.type === "update-info-capture-settings") {
    await chrome.storage.local.set(message.settings ?? {});
    return { ok: true, settings: await getSettings() };
  }
  return undefined;
}

async function ensureVisit(tab: chrome.tabs.Tab, reason: string) {
  if (!tab.id || !tab.url) return undefined;
  const settings = await getSettings();
  const state = getTabState(tab.id, tab.url);
  state.windowId = tab.windowId;
  state.settings = settings;
  if (!state.visitRecorded && settings.captureStream) {
    state.visitRecorded = true;
    const page = await collectFromTab(tab.id).catch(() => basicPageFromTab(tab));
    await sendVisit(page, state, reason);
    if (page.search?.query) await sendSearchQuery(page, state).catch(() => undefined);
    if (settings.snapshotOnVisit) await sendSnapshot(page, state, "initial_visit_snapshot", false).catch(() => undefined);
  }
  return state;
}

async function captureHeartbeat(tab: chrome.tabs.Tab) {
  if (!tab.id || !tab.url) return { ok: false, error: "no active tab" };
  const state = getTabState(tab.id, tab.url);
  state.windowId = tab.windowId;
  state.settings = await getSettings();
  const page = await collectFromTab(tab.id);
  const record = baseRecord({
    schemaName: "observation.browser_page_heartbeat",
    page,
    state,
    contentText: undefined,
    acquisitionMode: "passive",
    reason: "periodic active tab heartbeat",
    importance: 0.2,
    payload: {
      visit_id: state.visitId,
      dwell_seconds: Math.round((Date.now() - state.startedAt) / 1000),
      active_seconds: Math.round((Date.now() - state.activatedAt) / 1000),
      scroll_depth: page.scroll_depth,
      scroll_events: page.scroll_events,
      selection_count: page.selection_count,
      selected_text_length: page.selected_text?.length ?? 0,
      visible: true,
    },
  });
  return postRecord(record);
}

async function captureSnapshot(tab: chrome.tabs.Tab | undefined, reason: string, manual: boolean, manualSaveReason?: string) {
  if (!tab?.id || !tab.url) return { ok: false, error: "no active tab" };
  await ensureVisit(tab, "snapshot_requested");
  const state = getTabState(tab.id, tab.url);
  state.windowId = tab.windowId;
  state.settings = await getSettings();
  const page = await collectFromTab(tab.id);
  return sendSnapshot(page, state, reason, manual, manualSaveReason);
}

async function captureAmbientRequest(tab: chrome.tabs.Tab | undefined, reason: string) {
  if (!tab?.id || !tab.url) return { ok: false, error: "no active tab" };
  await ensureVisit(tab, "ambient_requested");
  const state = getTabState(tab.id, tab.url);
  state.windowId = tab.windowId;
  state.settings = await getSettings();
  const page = await collectFromTab(tab.id);
  const record = baseRecord({
    schemaName: "observation.browser_ambient_requested",
    page,
    state,
    contentText: page.text,
    acquisitionMode: "manual",
    reason,
    importance: 0.98,
    payload: {
      visit_id: state.visitId,
      canonical_url: page.metadata?.canonical_url,
      selected_text: page.selected_text,
      selected_text_length: page.selected_text?.length ?? 0,
      scroll_depth: page.scroll_depth,
      scroll_events: page.scroll_events,
      selection_count: page.selection_count,
      dwell_seconds: Math.round((Date.now() - state.startedAt) / 1000),
      metadata: page.metadata,
      text_quality: page.text_quality,
      search: page.search,
      request: { kind: "ambient_explore", button_clicked: true, requested_at: new Date().toISOString() },
    },
  });
  return postRecord(record, { process: true, cascadeViews: true });
}

async function sendVisit(page: PageContext, state: TabState, reason: string) {
  return postRecord(baseRecord({
    schemaName: "observation.browser_page_visit",
    page,
    state,
    contentText: undefined,
    acquisitionMode: "passive",
    reason,
    importance: 0.15,
    payload: {
      visit_id: state.visitId,
      tab_id: state.tabId,
      window_id: state.windowId,
      opened_at: state.openedAt,
      transition_reason: reason,
      metadata: page.metadata,
    },
  }));
}

async function sendSearchQuery(page: PageContext, state: TabState) {
  if (!page.search?.query) return { ok: false, error: "no search query" };
  return postRecord(baseRecord({
    schemaName: "observation.browser_search_query",
    page,
    state,
    contentText: page.search.query,
    acquisitionMode: "passive",
    reason: `search query on ${page.search.engine}`,
    importance: 0.65,
    payload: {
      visit_id: state.visitId,
      engine: page.search.engine,
      query: page.search.query,
      searched_at: page.search.searched_at,
      canonical_url: page.metadata?.canonical_url,
      metadata: page.metadata,
    },
  }));
}

async function sendSnapshot(page: PageContext, state: TabState, reason: string, manual: boolean, manualSaveReason?: string) {
  const schemaName = manual ? "observation.browser_page_saved" : "observation.browser_page_snapshot";
  const result = await postRecord(baseRecord({
    schemaName,
    page,
    state,
    contentText: page.text,
    acquisitionMode: manual ? "manual" : "passive",
    reason,
    importance: manual ? 0.95 : 0.35,
    payload: {
      visit_id: state.visitId,
      canonical_url: page.metadata?.canonical_url,
      selected_text: page.selected_text,
      selected_text_length: page.selected_text?.length ?? 0,
      scroll_depth: page.scroll_depth,
      scroll_events: page.scroll_events,
      selection_count: page.selection_count,
      dwell_seconds: Math.round((Date.now() - state.startedAt) / 1000),
      snapshot_reason: reason,
      metadata: page.metadata,
      text_quality: page.text_quality,
      search: page.search,
      manual_save_reason: manualSaveReason,
      reader_enrichment: manual,
    },
  }));
  if (result.ok) {
    state.snapshotCount += 1;
    state.lastSnapshotAt = Date.now();
  }
  return result;
}

async function sendBrowserAttention(payload: any, kind: string, tab?: chrome.tabs.Tab) {
  if (!payload?.selected_text) return { ok: false, error: "missing selected_text" };
  const settings = await getSettings();
  const privacy = privacyForUrl(payload.url, settings);
  const schemaName = kind === "copied" ? "observation.browser_text_copied" : "observation.browser_text_selected";
  return postRecord({
    schema: { name: schemaName, version: 1 },
    source: { type: "browser", connector: "chrome-acp" },
    scope: { domain: payload.domain, app: "chrome" },
    time: { observed_at: payload.selected_at ?? new Date().toISOString(), captured_at: new Date().toISOString() },
    content: { title: payload.title, url: payload.url, text: payload.selected_text },
    acquisition: { mode: "passive", actor: "user", reason: kind === "copied" ? "browser text copied" : "browser text selected" },
    signal: { importance: kind === "copied" ? 0.9 : 0.75, confidence: 0.95, status: "inbox" },
    privacy,
    payload: {
      ...payload,
      copied: kind === "copied",
      tab_id: tab?.id,
      window_id: tab?.windowId,
      attention_signal: kind,
      attention_weight: kind === "copied" ? 1.0 : 0.85,
    },
  });
}

async function explainSelection(payload: any, tab?: chrome.tabs.Tab) {
  if (!payload?.selected_text) return { ok: false, error: "missing selected_text" };
  const saved = await sendBrowserAttention({
    ...payload,
    explain_requested: true,
    requested_at: new Date().toISOString(),
  }, "selected", tab);
  const settings = await getSettings();
  const endpoint = contextChatEndpoint(settings);
  const question = [
    "Explain the selected text in plain language.",
    "Keep it concise.",
    "If the page context matters, mention the connection.",
  ].join(" ");
  const body = {
    question,
    page_context: {
      title: payload.title || tab?.title,
      url: payload.url || tab?.url,
      domain: payload.domain,
      selected_text: payload.selected_text,
      text: payload.surrounding_text || payload.selected_text,
    },
    scope: {
      domain: payload.domain,
      app: "chrome",
    },
    limit: 6,
  };
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const responseBody = await response.json().catch(() => ({}));
    return {
      ok: response.ok && Boolean(responseBody.ok),
      status: response.status,
      endpoint,
      answer: responseBody.answer,
      error: responseBody.error,
      saved,
      runtime: responseBody.runtime,
      stop_reason: responseBody.stop_reason,
    };
  } catch (error) {
    return { ok: false, status: 0, endpoint, error: error instanceof Error ? error.message : String(error), saved };
  }
}

async function sendWritingInput(payload: any, tab?: chrome.tabs.Tab) {
  const text = String(payload?.text ?? "").trim();
  if (text.length < 12) return { ok: false, error: "writing text too short" };
  const settings = await getSettings();
  const url = payload?.url || tab?.url || "";
  const privacy = privacyForUrl(url, settings);
  if (privacy.retention === "do_not_store") return { ok: true, stored: false, reason: "privacy do_not_store" };
  const record = {
    schema: { name: "observation.editor.text_changed", version: 1 },
    source: { type: "browser", connector: "chrome-acp" },
    scope: { domain: payload?.domain, app: "chrome" },
    time: { observed_at: payload?.changed_at ?? new Date().toISOString(), captured_at: new Date().toISOString() },
    content: { title: payload?.title || tab?.title || "Browser writing input", url, text: text.slice(0, 4000) },
    acquisition: { mode: "passive", actor: "user", reason: "browser writing input changed" },
    signal: { importance: 0.78, confidence: 0.86, status: "inbox" },
    privacy,
    payload: {
      ...payload,
      text: text.slice(0, 4000),
      full_text: String(payload?.full_text ?? "").slice(0, 8000) || undefined,
      page_context: sanitizeWritingPageContext(payload?.page_context),
      text_length: text.length,
      tab_id: tab?.id,
      window_id: tab?.windowId,
      writing_surface: "browser_inline",
    },
  };
  const posted = await postWritingAssistRecord(record);
  const writtenViews = viewIdsFromProcessedIngestResponse(posted.body);
  const views = Array.isArray(posted.body?.views)
    ? posted.body.views.map((view: any) => ({ ok: true, status: posted.status, body: { view }, view, endpoint: posted.endpoint }))
    : await fetchViews(writtenViews);
  return {
    ok: Boolean(posted.ok && posted.body?.ok),
    schema: record.schema.name,
    record_id: posted.body?.id || posted.body?.record?.id || posted.body?.duplicate_of,
    written_views: writtenViews,
    views,
    posted,
  };
}

function sanitizeWritingPageContext(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  const text = (key: string, limit: number) => {
    const raw = input[key];
    return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, limit) : undefined;
  };
  return {
    title: text("title", 300),
    url: text("url", 1000),
    domain: text("domain", 200),
    selected_text: text("selected_text", 2000),
    excerpt: text("excerpt", 6000),
    text_quality: typeof input.text_quality === "object" && input.text_quality ? input.text_quality : undefined,
  };
}

async function sendLifecycleEvent(state: TabState, event: string) {
  return postRecord({
    schema: { name: "observation.browser_lifecycle", version: 1 },
    source: { type: "browser", connector: "chrome-acp" },
    scope: { domain: state.domain, app: "chrome" },
    time: { observed_at: new Date().toISOString(), captured_at: new Date().toISOString() },
    content: { title: state.title, url: state.url },
    acquisition: { mode: "passive", actor: "user", reason: event },
    signal: { importance: 0.1, confidence: 0.9, status: "inbox" },
    privacy: state.privacy ?? privacyForUrl(state.url, await getSettings()),
    payload: { visit_id: state.visitId, event, dwell_seconds: Math.round((Date.now() - state.startedAt) / 1000) },
  });
}

async function sendYouTubeObservation(message: any, tab?: chrome.tabs.Tab) {
  if (!tab?.id || !tab.url) return { ok: false, error: "no active tab" };
  const schemaName = youtubeObservationSchema(message.schemaName);
  if (!schemaName) return { ok: false, error: "unsupported youtube observation schema" };
  await ensureVisit(tab, "youtube_observation");
  const state = getTabState(tab.id, tab.url);
  state.windowId = tab.windowId;
  state.settings = await getSettings();
  const page = await collectFromTab(tab.id).catch(() => basicPageFromTab(tab));
  const payload = message.payload && typeof message.payload === "object" ? message.payload : {};
  const text = youtubeObservationText(schemaName, payload);
  const record = baseRecord({
    schemaName,
    page,
    state,
    contentText: text,
    acquisitionMode: "passive",
    reason: `YouTube ${schemaName.replace(/^observation\.youtube\./, "").replace(/_/g, " ")} observed by content script`,
    importance: schemaName === "observation.youtube.caption_fragment" ? 0.78 : 0.48,
    payload: {
      ...payload,
      visit_id: state.visitId,
      tab_id: tab.id,
      window_id: tab.windowId,
    },
  });
  if (typeof payload.observed_at === "string") record.time.observed_at = payload.observed_at;
  if (typeof payload.video_url === "string") record.content.url = payload.video_url;
  if (typeof payload.video_title === "string") record.content.title = payload.video_title;
  return postRecord(record, { process: true, cascadeViews: true });
}

function youtubeObservationSchema(value: unknown): string | undefined {
  const schemaName = typeof value === "string" ? value : "";
  return [
    "observation.youtube.caption_state",
    "observation.youtube.caption_fragment",
    "observation.youtube.paused",
    "observation.youtube.played",
  ].includes(schemaName) ? schemaName : undefined;
}

function youtubeObservationText(schemaName: string, payload: Record<string, unknown>) {
  if (schemaName === "observation.youtube.caption_fragment") {
    return String(payload.caption_text ?? payload.subtitle_text ?? "").slice(0, 4000) || undefined;
  }
  if (schemaName === "observation.youtube.caption_state") {
    return `captions ${payload.enabled || payload.captions_enabled ? "enabled" : "disabled"}`;
  }
  if (schemaName === "observation.youtube.paused") return `paused at ${payload.current_time ?? payload.current_seconds ?? 0}`;
  if (schemaName === "observation.youtube.played") return `played from ${payload.current_time ?? payload.current_seconds ?? 0}`;
  return undefined;
}

function baseRecord(input: {
  schemaName: string;
  page: PageContext;
  state: TabState;
  contentText?: string;
  acquisitionMode: "passive" | "manual";
  reason: string;
  importance: number;
  payload: Record<string, unknown>;
}) {
  const privacy = privacyForUrl(input.page.url, input.state.settings);
  input.state.privacy = privacy;
  input.state.title = input.page.title;
  input.state.domain = input.page.domain ?? "";
  return {
    schema: { name: input.schemaName, version: 1 },
    source: { type: "browser", connector: "chrome-acp" },
    scope: { domain: input.page.domain, app: "chrome" },
    time: { observed_at: input.page.observed_at, captured_at: new Date().toISOString() },
    content: { title: input.page.title, url: input.page.url, text: input.contentText },
    acquisition: { mode: input.acquisitionMode, actor: "user", reason: input.reason },
    signal: { importance: input.importance, confidence: 0.9, status: input.schemaName === "observation.browser_page_saved" ? "accepted" : "inbox" },
    privacy,
    payload: input.payload,
  };
}

async function postRecord(record: any, options: { process?: boolean; cascadeViews?: boolean } = {}) {
  if (record.privacy?.retention === "do_not_store") {
    return { ok: true, stored: false, reason: "privacy do_not_store", schema: record.schema.name };
  }
  const settings = await getSettings();
  const endpoint = contextIngestEndpoint(settings, options);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body, schema: record.schema.name, endpoint };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error), schema: record.schema.name, endpoint };
  }
}

async function postWritingAssistRecord(record: any) {
  if (record.privacy?.retention === "do_not_store") {
    return { ok: true, stored: false, reason: "privacy do_not_store", schema: record.schema.name };
  }
  const settings = await getSettings();
  const endpoint = writingAssistEndpoint(settings);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body, schema: record.schema.name, endpoint };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error), schema: record.schema.name, endpoint };
  }
}

async function fetchViews(viewIds: string[]) {
  const settings = await getSettings();
  const views = [];
  for (const id of viewIds) {
    const endpoint = contextViewEndpoint(settings, id);
    try {
      const response = await fetch(endpoint);
      const body = await response.json().catch(() => ({}));
      views.push({ ok: response.ok, status: response.status, body, view: body.view, endpoint });
    } catch (error) {
      views.push({ ok: false, status: 0, error: error instanceof Error ? error.message : String(error), endpoint });
    }
  }
  return views;
}

async function pollContextViews(message: any) {
  const settings = await getSettings();
  const endpoint = contextViewsEndpoint(settings, {
    viewTypes: message.viewTypes,
    viewTypePrefix: message.viewTypePrefix,
    cursor: message.cursor,
    query: message.query,
    sourceRecordId: message.sourceRecordId,
    limit: message.limit ?? 8,
    activeOnly: message.activeOnly ?? true,
  });
  try {
    const response = await fetch(endpoint);
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok && Boolean(body.ok), status: response.status, endpoint, ...body };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error), endpoint };
  }
}

function shouldUseAgentTasksEndpoint(message: any) {
  const prefix = typeof message.viewTypePrefix === "string" ? message.viewTypePrefix : undefined;
  const types = Array.isArray(message.viewTypes) ? message.viewTypes : [];
  if (prefix === "agent." || prefix === "task.") return true;
  return types.some((type: unknown) => type === "agent.task_list" || type === "task.background_research" || type === "task.toolsmith_prototype");
}

async function pollAgentTasks(message: any) {
  const settings = await getSettings();
  const endpoint = agentTasksEndpoint(settings, { limit: message.limit ?? 8, refresh: message.refresh !== false });
  try {
    const response = await fetch(endpoint);
    const body = await response.json().catch(() => ({}));
    const taskList = body?.task_list ?? {};
    const taskViews = Array.isArray(taskList.items) ? taskList.items : [];
    return {
      ok: response.ok && Boolean(body.ok),
      status: response.status,
      endpoint,
      ...body,
      views: Array.isArray(body.views) ? body.views : [body.view, ...taskViews].filter(Boolean),
    };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error), endpoint };
  }
}

async function runAgentTasksAction(message: any) {
  const settings = await getSettings();
  const endpoint = agentTasksEndpoint(settings);
  const request: Record<string, unknown> = {
    mode: message.mode === "process" || message.mode === "queue_and_process" ? message.mode : "queue",
  };
  if (typeof message.runtime === "string" && message.runtime.trim()) request.runtime = message.runtime.trim();
  if (typeof message.limit === "number" && Number.isFinite(message.limit)) request.limit = message.limit;
  if (typeof message.dryRun === "boolean") request.dry_run = message.dryRun;
  if (typeof message.write === "boolean") request.write = message.write;
  if (typeof message.autonomy === "string" && message.autonomy.trim()) request.autonomy = message.autonomy.trim();
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok && Boolean(body.ok), status: response.status, endpoint, request, ...body };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error), endpoint, request };
  }
}

async function updateAgentTask(message: any) {
  if (typeof message.taskId !== "string" || !message.taskId.trim()) return { ok: false, error: "taskId is required" };
  const settings = await getSettings();
  const endpoint = agentTaskActionEndpoint(settings, message.taskId);
  const request: Record<string, unknown> = {
    action: message.action === "retry" ? "retry" : message.action === "cancel" ? "cancel" : undefined,
  };
  if (!request.action) return { ok: false, error: "action must be cancel or retry" };
  if (typeof message.reason === "string" && message.reason.trim()) request.reason = message.reason.trim();
  request.actor = "chrome_acp";
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok && Boolean(body.ok), status: response.status, endpoint, request, ...body };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error), endpoint, request };
  }
}

async function postViewFeedback(message: any) {
  if (!message.viewId || !message.feedbackType) return { ok: false, error: "viewId and feedbackType are required" };
  const settings = await getSettings();
  const endpoint = feedbackEndpoint(settings);
  const payload = {
    type: message.feedbackType,
    application_id: message.applicationId || "chrome_acp",
    view_id: message.viewId,
    value: message.value,
    reason: message.reason,
    payload: {
      surface: message.surface || "chrome_acp",
      ...(message.viewType ? { target_view_type: message.viewType } : {}),
      ...(message.payload ?? {}),
    },
  };
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok && Boolean(body.ok), status: response.status, endpoint, payload, ...body };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error), endpoint, payload };
  }
}

async function collectFromTab(tabId: number): Promise<PageContext> {
  return await chrome.tabs.sendMessage(tabId, { type: "collect-page-context" });
}

function basicPageFromTab(tab: chrome.tabs.Tab): PageContext {
  const url = tab.url || "";
  let domain = "";
  try { domain = new URL(url).hostname; } catch {}
  return {
    title: tab.title || url,
    url,
    domain,
    text: "",
    selected_text: "",
    scroll_depth: 0,
    scroll_events: 0,
    selection_count: 0,
    observed_at: new Date().toISOString(),
    metadata: {},
  };
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function getSettings(): Promise<InfoSettings> {
  const keys = Object.keys(DEFAULT_SETTINGS) as Array<keyof InfoSettings>;
  return { ...DEFAULT_SETTINGS, ...(await chrome.storage.local.get(keys)) };
}

function getTabState(tabId: number, url: string): TabState {
  let state = tabState.get(tabId);
  if (!state || state.url !== url) {
    let domain = "";
    try { domain = new URL(url).hostname; } catch {}
    state = {
      tabId,
      url,
      domain,
      visitId: crypto.randomUUID(),
      openedAt: new Date().toISOString(),
      startedAt: Date.now(),
      activatedAt: Date.now(),
      visitRecorded: false,
      snapshotCount: 0,
      lastSnapshotAt: 0,
      settings: DEFAULT_SETTINGS,
    };
    tabState.set(tabId, state);
  }
  state.activatedAt = Date.now();
  return state;
}

function summarizeState(state?: TabState) {
  if (!state) return undefined;
  return {
    tabId: state.tabId,
    url: state.url,
    visit_id: state.visitId,
    dwell_seconds: Math.round((Date.now() - state.startedAt) / 1000),
    snapshot_count: state.snapshotCount,
    lastSnapshotAt: state.lastSnapshotAt,
    visitRecorded: state.visitRecorded,
  };
}

function privacyForUrl(rawUrl?: string, settings: InfoSettings = DEFAULT_SETTINGS) {
  let u: URL;
  try { u = new URL(rawUrl || ""); } catch { return secretPrivacy(); }
  const host = u.hostname;
  const path = u.pathname;
  if (!["http:", "https:"].includes(u.protocol)) return secretPrivacy();
  if ((settings.excludedDomains ?? []).some(d => host === d || host.endsWith(`.${d}`))) return secretPrivacy();
  if (/(bank|pay|checkout|1password|bitwarden|lastpass|account|login|password|token|secret|oauth|auth|mail|gmail|icloud)/i.test(host + path)) {
    return secretPrivacy();
  }
  const isPublicish = !/(localhost|127\.0\.0\.1|\.local$)/i.test(host);
  return {
    level: isPublicish ? "private" : "workspace",
    retention: "normal",
    allow_embedding: true,
    allow_llm_summary: true,
    allow_external_llm: Boolean(settings.allowExternalLlm),
    allow_external_reader: isPublicish,
  };
}

function secretPrivacy() {
  return { level: "secret", retention: "do_not_store", allow_embedding: false, allow_llm_summary: false, allow_external_reader: false };
}

function contextIngestEndpoint(settings: InfoSettings, options: { process?: boolean; cascadeViews?: boolean }) {
  const url = new URL(settings.endpoint || DEFAULT_SETTINGS.endpoint);
  if (options.process) url.searchParams.set("process", "true");
  if (options.cascadeViews) url.searchParams.set("cascade_views", "true");
  return url.toString();
}

function contextViewEndpoint(settings: InfoSettings, viewId: string) {
  const url = new URL(settings.endpoint || DEFAULT_SETTINGS.endpoint);
  url.pathname = `/context/views/${encodeURIComponent(viewId)}`;
  url.search = "";
  return url.toString();
}

function writingAssistEndpoint(settings: InfoSettings) {
  const url = new URL(settings.endpoint || DEFAULT_SETTINGS.endpoint);
  url.pathname = "/writing/assist";
  url.search = "";
  return url.toString();
}

function contextChatEndpoint(settings: InfoSettings) {
  const url = new URL(settings.endpoint || DEFAULT_SETTINGS.endpoint);
  url.pathname = "/context/chat";
  url.search = "";
  return url.toString();
}

function contextViewsEndpoint(settings: InfoSettings, options: any = {}) {
  const url = new URL(settings.endpoint || DEFAULT_SETTINGS.endpoint);
  url.pathname = "/context/views";
  url.search = "";
  if (options.limit) url.searchParams.set("limit", String(options.limit));
  if (Array.isArray(options.viewTypes) && options.viewTypes.length) url.searchParams.set("view_types", options.viewTypes.join(","));
  if (options.viewTypePrefix) url.searchParams.set("view_type_prefix", options.viewTypePrefix);
  if (options.summaryOnly || options.viewTypePrefix) url.searchParams.set("summary_only", "true");
  if (options.activeOnly) url.searchParams.set("active_only", "true");
  if (options.cursor) url.searchParams.set("cursor", options.cursor);
  if (options.query) url.searchParams.set("query", options.query);
  if (options.sourceRecordId) url.searchParams.set("source_record_id", options.sourceRecordId);
  return url.toString();
}

function agentTasksEndpoint(settings: InfoSettings, options: any = {}) {
  const url = new URL(settings.endpoint || DEFAULT_SETTINGS.endpoint);
  url.pathname = "/agent/tasks";
  url.search = "";
  if (options.limit) url.searchParams.set("limit", String(options.limit));
  if (options.refresh) url.searchParams.set("refresh", "true");
  return url.toString();
}

function agentTaskActionEndpoint(settings: InfoSettings, taskId: string) {
  const url = new URL(settings.endpoint || DEFAULT_SETTINGS.endpoint);
  url.pathname = `/agent/tasks/${encodeURIComponent(taskId)}`;
  url.search = "";
  return url.toString();
}

function feedbackEndpoint(settings: InfoSettings) {
  const url = new URL(settings.endpoint || DEFAULT_SETTINGS.endpoint);
  url.pathname = "/feedback";
  url.search = "process=true";
  return url.toString();
}

function viewIdsFromProcessedIngestResponse(body: any) {
  const direct = Array.isArray(body?.written_views) ? body.written_views : [];
  const firstPass = Array.isArray(body?.processing?.runs)
    ? body.processing.runs.flatMap((run: any) => Array.isArray(run?.written_views) ? run.written_views : [])
    : [];
  const cascaded = Array.isArray(body?.cascade_processing)
    ? body.cascade_processing.flatMap((processing: any) =>
        Array.isArray(processing?.runs)
          ? processing.runs.flatMap((run: any) => Array.isArray(run?.written_views) ? run.written_views : [])
          : [],
      )
    : [];
  return [...new Set([...direct, ...firstPass, ...cascaded].filter((id): id is string => typeof id === "string" && Boolean(id)))];
}
