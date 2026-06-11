let maxScrollDepth = 0;
let scrollEvents = 0;
let selectionCount = 0;
let lastSelectedText = "";
let selectionTimer: number | undefined;
let selectionToolbar: HTMLDivElement | null = null;
let activeSelectionPayload: any = null;
let selectionRequestSeq = 0;
let writingTimer: number | undefined;
let lastWritingText = "";
let activeWritingElement: Element | null = null;
let assistBubble: HTMLDivElement | null = null;
let assistElement: Element | null = null;
let pendingInsertedDraftEdit: {
  element: Element;
  view: any;
  draft: string;
  beforeText: string;
  insertedText: string;
  lastText: string;
  createdAt: number;
  sent: boolean;
} | null = null;
let insertedDraftEditTimer: number | undefined;
let writingRequestSeq = 0;
const startedAt = Date.now();
const WRITING_VIEW_TYPES = ["draft.writing_continuation", "advice.writing_assist"];
const WRITING_ASSIST_POLL_ATTEMPTS = 45;
const WRITING_ASSIST_POLL_INTERVAL_MS = 2000;
const DEFAULT_SELECTION_ACTIONS = [
  {
    id: "explain",
    label: "Explain",
    prompt: "Explain this selected text in plain language. Keep it concise, and mention the page context if it matters.",
  },
  {
    id: "translate_zh",
    label: "Translate",
    prompt: "Translate this selected text into natural Simplified Chinese. Preserve names, technical terms, and the original meaning.",
  },
];

function visibleText() {
  const clone = document.body?.cloneNode(true) as HTMLElement | undefined;
  if (!clone) return "";
  clone.querySelectorAll("script,style,noscript,svg,canvas,iframe,nav,footer").forEach((el) => el.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120_000);
}

function textQuality(text: string) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  const words = compact.match(/[A-Za-z][A-Za-z'-]*/g) || [];
  const cjk = compact.match(/[\u4e00-\u9fff]/g) || [];
  const letters = compact.match(/[A-Za-z]/g) || [];
  const totalSignal = Math.max(1, letters.length + cjk.length);
  const englishRatio = letters.length / totalSignal;
  const uniqueWords = new Set(words.map(w => w.toLowerCase())).size;
  const repeatedRatio = words.length ? 1 - uniqueWords / words.length : 0;
  const sentenceCount = (compact.match(/[.!?。！？]/g) || []).length;
  return {
    detected_language: document.documentElement.lang || (englishRatio > 0.65 ? "en" : cjk.length > letters.length ? "zh" : undefined),
    english_ratio: Number(englishRatio.toFixed(3)),
    word_count: words.length,
    char_count: compact.length,
    sentence_count: sentenceCount,
    repeated_ratio: Number(repeatedRatio.toFixed(3)),
    quality_score: Number(Math.min(1, Math.max(0, englishRatio * 0.45 + Math.min(1, words.length / 500) * 0.35 + Math.min(1, sentenceCount / 20) * 0.2 - repeatedRatio * 0.2)).toFixed(3)),
  };
}

function searchQueryInfo() {
  const host = location.hostname.replace(/^www\./, "");
  const params = new URLSearchParams(location.search);
  const path = location.pathname;
  const engines = [
    { test: /(^|\.)google\./, name: "google", param: "q" },
    { test: /(^|\.)bing\.com$/, name: "bing", param: "q" },
    { test: /(^|\.)duckduckgo\.com$/, name: "duckduckgo", param: "q" },
    { test: /(^|\.)baidu\.com$/, name: "baidu", param: "wd" },
    { test: /(^|\.)perplexity\.ai$/, name: "perplexity", param: "q" },
    { test: /(^|\.)github\.com$/, name: "github", param: "q", path: /^\/search/ },
    { test: /(^|\.)youtube\.com$/, name: "youtube", param: "search_query", path: /^\/results/ },
  ];
  for (const engine of engines) {
    if (!engine.test.test(host)) continue;
    if (engine.path && !engine.path.test(path)) continue;
    const query = params.get(engine.param)?.trim();
    if (!query) continue;
    return { engine: engine.name, query, param: engine.param, url: location.href, title: document.title, searched_at: new Date().toISOString() };
  }
  return undefined;
}

function metadata() {
  const pick = (selector: string, attr = "content") => document.querySelector(selector)?.getAttribute(attr) || undefined;
  return {
    description: pick('meta[name="description"]'),
    og_title: pick('meta[property="og:title"]'),
    og_description: pick('meta[property="og:description"]'),
    canonical_url: (document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null)?.href || undefined,
    lang: document.documentElement.lang || undefined,
  };
}

function scrollDepth() {
  const doc = document.documentElement;
  const max = Math.max(1, doc.scrollHeight - window.innerHeight);
  return Math.min(1, Math.max(0, (window.scrollY + window.innerHeight) / Math.max(doc.scrollHeight, window.innerHeight), window.scrollY / max));
}

function selectionContext(kind = "selected") {
  const selection = window.getSelection?.();
  const selectedText = String(selection ?? "").trim();
  if (!selection || !selectedText) return undefined;
  const range = selection.rangeCount ? selection.getRangeAt(0) : undefined;
  const node = range?.commonAncestorContainer;
  const element = node?.nodeType === Node.ELEMENT_NODE ? node as Element : node?.parentElement;
  const rect = range?.getBoundingClientRect?.();
  const surroundingText = (element as HTMLElement | undefined)?.innerText?.replace(/\s+/g, " ").trim().slice(0, 2000);
  return {
    kind,
    selected_text: selectedText,
    surrounding_text: surroundingText,
    selection_length: selectedText.length,
    tag: element?.tagName,
    url: location.href,
    title: document.title,
    domain: location.hostname,
    canonical_url: (document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null)?.href || location.href,
    page_language: document.documentElement.lang || undefined,
    scroll_depth: Math.max(maxScrollDepth, scrollDepth()),
    viewport: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : undefined,
    selected_at: new Date().toISOString(),
    metadata: metadata(),
    text_quality: textQuality(selectedText),
  };
}

function collectPageContext() {
  const selected = String(getSelection?.() ?? "").trim();
  if (selected && selected !== lastSelectedText) {
    selectionCount += 1;
    lastSelectedText = selected;
  }
  maxScrollDepth = Math.max(maxScrollDepth, scrollDepth());
  const text = visibleText();
  return {
    title: document.title,
    url: location.href,
    domain: location.hostname,
    text,
    selected_text: selected,
    scroll_depth: maxScrollDepth,
    scroll_events: scrollEvents,
    selection_count: selectionCount,
    page_active_seconds: Math.round((Date.now() - startedAt) / 1000),
    observed_at: new Date().toISOString(),
    metadata: metadata(),
    text_quality: textQuality(text),
    search: searchQueryInfo(),
  };
}

function sendAttention(kind: "selected" | "copied") {
  const payload = selectionContext(kind);
  if (!payload || payload.selected_text.length < 3) return;
  chrome.runtime.sendMessage({ type: "context.capture.browser_attention", kind, payload }).catch(() => undefined);
}

function handleStableSelection() {
  const payload = selectionContext("selected");
  if (!payload || payload.selected_text.length < 3) {
    removeSelectionToolbar();
    return;
  }
  activeSelectionPayload = payload;
  showSelectionToolbar(payload);
  chrome.runtime.sendMessage({ type: "context.capture.browser_attention", kind: "selected", payload }).catch(() => undefined);
}

window.addEventListener("scroll", () => {
  scrollEvents += 1;
  maxScrollDepth = Math.max(maxScrollDepth, scrollDepth());
}, { passive: true });

document.addEventListener("selectionchange", () => {
  const selected = String(getSelection?.() ?? "").trim();
  if (selected && selected !== lastSelectedText) {
    selectionCount += 1;
    lastSelectedText = selected;
  }
  clearTimeout(selectionTimer);
  selectionTimer = window.setTimeout(() => handleStableSelection(), 650);
});

document.addEventListener("copy", () => {
  window.setTimeout(() => sendAttention("copied"), 0);
});

document.addEventListener("mousedown", (event) => {
  if (selectionToolbar?.contains(event.target as Node)) return;
  const selected = String(getSelection?.() ?? "").trim();
  if (!selected) removeSelectionToolbar();
}, true);

document.addEventListener("focusin", (event) => {
  const target = editableElement(event.target);
  if (!target) return;
  attachWritingWidget(target);
}, true);

document.addEventListener("click", (event) => {
  const target = editableElement(event.target);
  if (!target) return;
  attachWritingWidget(target);
}, true);

document.addEventListener("keyup", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const target = editableElement(event.target);
  if (!target) return;
  queueWritingInput(target);
}, true);

document.addEventListener("compositionend", (event) => {
  const target = editableElement(event.target);
  if (!target) return;
  queueWritingInput(target);
}, true);

document.addEventListener("input", (event) => {
  const target = editableElement(event.target);
  if (!target) return;
  queueWritingInput(target);
}, true);

function queueWritingInput(target: Element) {
  attachWritingWidget(target);
  const fullText = editableText(target);
  const text = focusedWritingText(target, fullText);
  observeInsertedDraftEdit(target, text);
  if (!shouldSendWritingText(text, target)) return;
  clearTimeout(writingTimer);
  writingTimer = window.setTimeout(() => sendWritingInput(target, text, fullText), 900);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "collect-page-context") {
    sendResponse(collectPageContext());
    return true;
  }
});

function editableElement(target: EventTarget | null) {
  const element = target instanceof Element ? target : undefined;
  if (!element) return undefined;
  const editable = element.closest("textarea,input,[contenteditable='true'],[contenteditable='plaintext-only']");
  if (!editable) return undefined;
  if (editable instanceof HTMLInputElement) {
    const type = (editable.type || "text").toLowerCase();
    if (!["text", "search", "url", "email", "tel"].includes(type)) return undefined;
  }
  return editable;
}

function attachWritingWidget(element: Element) {
  if (sensitiveEditable(element)) return;
  activeWritingElement = element;
  if (!assistBubble || assistElement !== element) {
    showWritingIdle(element);
    return;
  }
  positionAssistBubble(element);
}

function editableText(element: Element) {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) return element.value;
  return element.textContent || "";
}

function focusedWritingText(element: Element, fullText: string) {
  const selected = String(window.getSelection?.() ?? "").replace(/\s+/g, " ").trim();
  if (selected.length >= 12) return selected.slice(0, 2000);
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const caret = element.selectionStart ?? fullText.length;
    return textAroundOffset(fullText, caret, 1800);
  }
  const selection = window.getSelection?.();
  const anchor = selection?.anchorNode;
  const block = anchor ? editableBlockText(anchor, element) : "";
  return (block || fullText).replace(/\s+/g, " ").trim().slice(0, 2000);
}

function editableBlockText(node: Node, root: Element) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  const block = element?.closest("p,li,h1,h2,h3,h4,h5,h6,blockquote,pre,[data-block-id],[data-page-id],[role='textbox'],div");
  if (block && root.contains(block)) return block.textContent || "";
  return element && root.contains(element) ? element.textContent || "" : "";
}

function textAroundOffset(text: string, offset: number, max: number) {
  const half = Math.floor(max / 2);
  const start = Math.max(0, offset - half);
  const end = Math.min(text.length, offset + half);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function shouldSendWritingText(text: string, element: Element) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length < 24 || normalized.length > 5000) return false;
  if (normalized === lastWritingText) return false;
  if (element instanceof HTMLInputElement && normalized.length < 40) return false;
  if (sensitiveEditable(element)) return false;
  lastWritingText = normalized;
  return true;
}

function sensitiveEditable(element: Element) {
  return /password|token|secret|api[_-]?key|credit card|验证码|密码/i.test(`${element.id || ""} ${element.getAttribute("name") || ""} ${element.getAttribute("autocomplete") || ""}`);
}

function sendWritingInput(element: Element, text: string, fullText = text) {
  const rect = element.getBoundingClientRect();
  const requestSeq = ++writingRequestSeq;
  showWritingPending(element, requestSeq);
  chrome.runtime.sendMessage({
    type: "context.capture.writing_input",
    payload: {
      title: document.title,
      url: location.href,
      domain: location.hostname,
      text,
      full_text: fullText,
      field_tag: element.tagName,
      field_id: element.id || undefined,
      field_name: element.getAttribute("name") || undefined,
      field_role: element.getAttribute("role") || undefined,
      field_placeholder: element.getAttribute("placeholder") || undefined,
      viewport: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      changed_at: new Date().toISOString(),
      metadata: metadata(),
      text_quality: textQuality(text),
    },
  }).then(async (result) => {
    if (showWritingAssist(result, element)) return;
    await pollWritingAssist(element, text, result, requestSeq);
  }).catch(() => {
    showWritingError(element, requestSeq, "Could not reach writing assist.");
  });
}

function showWritingPending(element: Element, requestSeq: number) {
  removeAssistBubble();
  assistElement = element;
  assistBubble = document.createElement("div");
  assistBubble.id = "info-writing-assist";
  assistBubble.className = "is-collapsed is-pending";
  assistBubble.dataset.requestSeq = String(requestSeq);
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "info-writing-trigger";
  trigger.title = "Writing suggestion is generating";
  trigger.textContent = "Info...";
  assistBubble.append(trigger);
  document.documentElement.append(assistBubble);
  positionAssistBubble(element);
}

function showWritingIdle(element: Element) {
  removeAssistBubble();
  assistElement = element;
  assistBubble = document.createElement("div");
  assistBubble.id = "info-writing-assist";
  assistBubble.className = "is-collapsed is-idle";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "info-writing-trigger";
  trigger.title = "Writing assist is ready";
  trigger.textContent = "Info";
  assistBubble.append(trigger);
  document.documentElement.append(assistBubble);
  positionAssistBubble(element);
}

function showWritingError(element: Element, requestSeq: number, message: string) {
  if (assistBubble?.dataset.requestSeq && assistBubble.dataset.requestSeq !== String(requestSeq)) return;
  removeAssistBubble();
  assistElement = element;
  assistBubble = document.createElement("div");
  assistBubble.id = "info-writing-assist";
  assistBubble.className = "is-collapsed is-error";
  assistBubble.dataset.requestSeq = String(requestSeq);
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "info-writing-trigger";
  trigger.title = "Writing suggestion failed";
  trigger.textContent = "Info!";
  const panel = document.createElement("div");
  panel.className = "info-writing-panel";
  const title = document.createElement("div");
  title.className = "info-writing-title";
  title.textContent = "Info writing";
  const body = document.createElement("div");
  body.className = "info-writing-body";
  body.textContent = message;
  const actions = document.createElement("div");
  actions.className = "info-writing-actions";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Dismiss";
  close.addEventListener("click", () => removeAssistBubble());
  actions.append(close);
  panel.append(title, body, actions);
  assistBubble.append(trigger, panel);
  document.documentElement.append(assistBubble);
  trigger.addEventListener("click", () => {
    assistBubble?.classList.toggle("is-collapsed");
    positionAssistBubble(element);
  });
  positionAssistBubble(element);
}

function removePendingAssist(requestSeq: number) {
  if (assistBubble?.classList.contains("is-pending") && assistBubble.dataset.requestSeq === String(requestSeq)) {
    if (activeWritingElement?.isConnected) showWritingIdle(activeWritingElement);
    else removeAssistBubble();
  }
}

function showWritingAssist(result: any, element: Element) {
  const view = writingViewFromResult(result);
  const draft = draftTextFromView(view);
  const suggestions = suggestionsFromView(view);
  if (!view || (!draft && !suggestions.length)) return false;
  removeAssistBubble();
  assistElement = element;
  assistBubble = document.createElement("div");
  assistBubble.id = "info-writing-assist";
  assistBubble.className = "is-collapsed";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "info-writing-trigger";
  trigger.title = "Show writing suggestion";
  trigger.textContent = view.view_type === "draft.writing_continuation" ? "Info draft" : "Info";
  const title = document.createElement("div");
  title.className = "info-writing-title";
  title.textContent = view.view_type === "draft.writing_continuation" ? "Info draft" : "Info writing";
  const panel = document.createElement("div");
  panel.className = "info-writing-panel";
  const body = document.createElement("div");
  body.className = "info-writing-body";
  body.textContent = draft || suggestions[0];
  const actions = document.createElement("div");
  actions.className = "info-writing-actions";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Dismiss";
  close.addEventListener("click", () => {
    submitWritingFeedback(view, {
      feedbackType: "analysis.dismissed",
      value: "dismissed",
      reason: "Dismissed inline writing assist.",
      payload: { action: "dismiss", surface: "writing_inline", draft_text: draft || undefined, suggestion_count: suggestions.length },
    });
    removeAssistBubble();
  });
  actions.append(close);
  if (draft) {
    const insert = document.createElement("button");
    insert.type = "button";
    insert.textContent = "Insert";
    insert.addEventListener("click", () => {
      const beforeText = editableText(element);
      insertDraft(element, draft);
      const afterText = editableText(element);
      rememberInsertedDraftForEdit(element, view, draft, beforeText, afterText);
      submitWritingFeedback(view, {
        feedbackType: "analysis.useful",
        value: "inserted",
        reason: "Inserted inline writing draft.",
        payload: { action: "insert", surface: "writing_inline", draft_text: draft, original_text: beforeText, edited_text: afterText },
      });
      removeAssistBubble();
    });
    actions.append(insert);
  }
  panel.append(title, body, actions);
  assistBubble.append(trigger, panel);
  document.documentElement.append(assistBubble);
  trigger.addEventListener("click", () => {
    assistBubble?.classList.toggle("is-collapsed");
    positionAssistBubble(element);
  });
  assistBubble.addEventListener("mouseenter", () => {
    assistBubble?.classList.remove("is-collapsed");
    positionAssistBubble(element);
  });
  positionAssistBubble(element);
  return true;
}

async function pollWritingAssist(element: Element, text: string, result: any, requestSeq: number) {
  const sourceRecordId = result?.record_id;
  if (!sourceRecordId) {
    showWritingError(element, requestSeq, result?.error || result?.posted?.body?.error || "Writing assist did not return a request id.");
    return;
  }
  for (let attempt = 0; attempt < WRITING_ASSIST_POLL_ATTEMPTS; attempt += 1) {
    await delay(attempt === 0 ? 900 : WRITING_ASSIST_POLL_INTERVAL_MS);
    const currentText = focusedWritingText(element, editableText(element));
    if (requestSeq !== writingRequestSeq || !element.isConnected || normalizeWriting(currentText) !== normalizeWriting(text)) {
      removePendingAssist(requestSeq);
      return;
    }
    const polled = await chrome.runtime.sendMessage({
      type: "poll-context-views",
      viewTypes: WRITING_VIEW_TYPES,
      sourceRecordId,
      limit: 4,
      activeOnly: true,
    }).catch(() => undefined);
    if (showWritingAssist(polled, element)) return;
  }
  showWritingError(element, requestSeq, "Writing assist timed out.");
}

function writingViewFromResult(result: any) {
  const views = Array.isArray(result?.views) ? result.views.map((item: any) => item?.view ?? item).filter(Boolean) : [];
  return views.find((view: any) => view.view_type === "draft.writing_continuation")
    || views.find((view: any) => view.view_type === "advice.writing_assist");
}

function delay(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function draftTextFromView(view: any) {
  const value = view?.content?.draft_text || view?.summary;
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function suggestionsFromView(view: any) {
  const value = view?.content?.suggestions;
  return Array.isArray(value) ? value.filter(item => typeof item === "string" && item.trim()) : [];
}

function submitWritingFeedback(view: any, input: any) {
  if (!view?.id || !input?.feedbackType) return;
  chrome.runtime.sendMessage({
    type: "feedback-view",
    viewId: view.id,
    viewType: view.view_type,
    feedbackType: input.feedbackType,
    value: input.value,
    reason: input.reason,
    applicationId: "editor.inline_assist",
    payload: {
      target_view_id: view.id,
      target_view_type: view.view_type,
      ...(input.payload ?? {}),
    },
  }).catch(() => undefined);
}

function rememberInsertedDraftForEdit(element: Element, view: any, draft: string, beforeText: string, afterText: string) {
  if (!view?.id || !draft || sensitiveEditable(element)) return;
  clearTimeout(insertedDraftEditTimer);
  pendingInsertedDraftEdit = { element, view, draft, beforeText, insertedText: afterText, lastText: afterText, createdAt: Date.now(), sent: false };
}

function observeInsertedDraftEdit(element: Element, text: string) {
  const pending = pendingInsertedDraftEdit;
  if (!pending || pending.sent || pending.element !== element) return;
  if (Date.now() - pending.createdAt > 120_000 || sensitiveEditable(element)) {
    clearPendingInsertedDraftEdit();
    return;
  }
  if (normalizeWriting(text) === normalizeWriting(pending.insertedText)) return;
  pending.lastText = text;
  clearTimeout(insertedDraftEditTimer);
  insertedDraftEditTimer = window.setTimeout(() => flushInsertedDraftEditFeedback(), 1800);
}

function flushInsertedDraftEditFeedback() {
  const pending = pendingInsertedDraftEdit;
  if (!pending || pending.sent) return;
  const editedText = String(pending.lastText || "").trim();
  if (editedText.length < 12 || normalizeWriting(editedText) === normalizeWriting(pending.insertedText)) return;
  pending.sent = true;
  submitWritingFeedback(pending.view, {
    feedbackType: "output.edited",
    value: "edited",
    reason: "Edited inline writing draft after insertion.",
    payload: {
      action: "edit_after_insert",
      surface: "writing_inline",
      original_text: pending.draft,
      edited_text: editedText,
      inserted_context_text: pending.insertedText,
      pre_insert_text: pending.beforeText,
    },
  });
  clearPendingInsertedDraftEdit();
}

function clearPendingInsertedDraftEdit() {
  clearTimeout(insertedDraftEditTimer);
  insertedDraftEditTimer = undefined;
  pendingInsertedDraftEdit = null;
}

function normalizeWriting(text: string) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function insertDraft(element: Element, draft: string) {
  if (!draft) return;
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const start = element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? element.value.length;
    const prefix = element.value.slice(0, start);
    const suffix = element.value.slice(end);
    const insertion = `${prefix && !/\s$/.test(prefix) ? " " : ""}${draft}`;
    element.value = `${prefix}${insertion}${suffix}`;
    element.selectionStart = element.selectionEnd = start + insertion.length;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: draft }));
    return;
  }
  (element as HTMLElement).focus();
  document.execCommand("insertText", false, `${editableText(element).trim() ? " " : ""}${draft}`);
}

function positionAssistBubble(element: Element) {
  if (!assistBubble) return;
  const rect = editablePositionRect(element);
  const bubbleRect = assistBubble.getBoundingClientRect();
  const collapsed = assistBubble.classList.contains("is-collapsed");
  const width = collapsed ? Math.max(92, bubbleRect.width || 92) : Math.max(318, bubbleRect.width || 318);
  const height = collapsed ? Math.max(32, bubbleRect.height || 32) : Math.max(128, bubbleRect.height || 128);
  const collapsedLeft = rect.right + 8;
  const panelLeft = Math.min(rect.left, rect.right - width);
  const top = Math.max(12, Math.min(window.innerHeight - height - 12, rect.bottom + 8));
  const left = Math.max(12, Math.min(window.innerWidth - width - 12, collapsed ? collapsedLeft : panelLeft));
  assistBubble.style.top = `${top + window.scrollY}px`;
  assistBubble.style.left = `${left + window.scrollX}px`;
}

function removeAssistBubble() {
  assistBubble?.remove();
  assistBubble = null;
  assistElement = null;
}

function editablePositionRect(element: Element) {
  if (!(element instanceof HTMLTextAreaElement) && !(element instanceof HTMLInputElement)) {
    const selection = window.getSelection?.();
    const anchor = selection?.anchorNode;
    if (selection?.rangeCount && anchor && element.contains(anchor.nodeType === Node.ELEMENT_NODE ? anchor as Element : anchor.parentElement)) {
      const range = selection.getRangeAt(0).cloneRange();
      const rects = Array.from(range.getClientRects());
      const rect = rects[rects.length - 1] || range.getBoundingClientRect();
      if (rect && (rect.width || rect.height)) return rect;
    }
  }
  return element.getBoundingClientRect();
}

async function selectionActions() {
  try {
    const stored = await chrome.storage?.local?.get?.("selectionActions");
    const custom = Array.isArray(stored?.selectionActions) ? stored.selectionActions : [];
    const normalized = custom
      .filter((action: any) => action && action.enabled !== false && action.id && action.label && action.prompt)
      .map((action: any) => ({
        id: String(action.id),
        label: String(action.label).slice(0, 24),
        prompt: String(action.prompt),
      }));
    return normalized.length ? normalized : DEFAULT_SELECTION_ACTIONS;
  } catch {
    return DEFAULT_SELECTION_ACTIONS;
  }
}

function showSelectionToolbar(payload: any) {
  removeSelectionToolbar();
  const rect = selectionRect();
  if (!rect) return;
  selectionToolbar = document.createElement("div");
  selectionToolbar.id = "info-selection-toolbar";
  selectionToolbar.className = "is-ready";
  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "Save";
  save.addEventListener("click", () => saveSelection(payload));
  document.documentElement.append(selectionToolbar);
  selectionActions().then((actions) => {
    if (!selectionToolbar || activeSelectionPayload !== payload) return;
    selectionToolbar.textContent = "";
    for (const action of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = action.label;
      button.addEventListener("click", () => runSelectionAction(action, payload));
      selectionToolbar.append(button);
    }
    selectionToolbar.append(save);
    positionSelectionToolbar(rect);
  });
  positionSelectionToolbar(rect);
}

function saveSelection(payload = activeSelectionPayload) {
  if (!payload?.selected_text) return;
  chrome.runtime.sendMessage({
    type: "context.capture.browser_attention",
    kind: "selected",
    payload: {
      ...payload,
      manual_save: true,
      saved_at: new Date().toISOString(),
    },
  }).then((result) => {
    showSelectionStatus(result?.ok === false ? "Save failed" : "Saved");
  }).catch(() => showSelectionStatus("Save failed"));
}

function runSelectionAction(action: any, payload = activeSelectionPayload) {
  if (!payload?.selected_text) return;
  const requestSeq = ++selectionRequestSeq;
  showSelectionStatus("Opening Chat...");
  chrome.runtime.sendMessage({
    type: "sidepanel.run.selection_action",
    action,
    payload,
  }).then((result) => {
    if (requestSeq !== selectionRequestSeq) return;
    if (!result?.ok) {
      showSelectionStatus(result?.error || "Explain failed");
      return;
    }
    showSelectionStatus("Sent to Chat");
    window.setTimeout(() => {
      if (requestSeq === selectionRequestSeq) removeSelectionToolbar();
    }, 1200);
  }).catch(() => {
    if (requestSeq === selectionRequestSeq) showSelectionStatus("Explain failed");
  });
}

function showSelectionStatus(text: string) {
  if (!selectionToolbar) return;
  selectionToolbar.className = "is-status";
  selectionToolbar.textContent = text;
  const rect = selectionRect();
  if (rect) positionSelectionToolbar(rect);
}

function showSelectionAnswer(answer: string) {
  if (!selectionToolbar) return;
  selectionToolbar.className = "is-answer";
  selectionToolbar.textContent = "";
  const title = document.createElement("div");
  title.className = "info-selection-title";
  title.textContent = "Info explain";
  const body = document.createElement("div");
  body.className = "info-selection-body";
  body.textContent = answer;
  const actions = document.createElement("div");
  actions.className = "info-selection-actions";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Dismiss";
  close.addEventListener("click", () => removeSelectionToolbar());
  actions.append(close);
  selectionToolbar.append(title, body, actions);
  const rect = selectionRect();
  if (rect) positionSelectionToolbar(rect);
}

function selectionRect() {
  const selection = window.getSelection?.();
  if (!selection?.rangeCount || !String(selection).trim()) return undefined;
  const range = selection.getRangeAt(0).cloneRange();
  const rects = Array.from(range.getClientRects()).filter(rect => rect.width || rect.height);
  return rects[rects.length - 1] || range.getBoundingClientRect();
}

function positionSelectionToolbar(rect: DOMRect) {
  if (!selectionToolbar) return;
  const toolbarRect = selectionToolbar.getBoundingClientRect();
  const width = Math.max(144, toolbarRect.width || 144);
  const height = Math.max(34, toolbarRect.height || 34);
  const top = Math.max(12, Math.min(window.innerHeight - height - 12, rect.bottom + 8));
  const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left));
  selectionToolbar.style.top = `${top + window.scrollY}px`;
  selectionToolbar.style.left = `${left + window.scrollX}px`;
}

function removeSelectionToolbar() {
  selectionToolbar?.remove();
  selectionToolbar = null;
  activeSelectionPayload = null;
}

const style = document.createElement("style");
style.textContent = `
  #info-selection-toolbar {
    position: absolute;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: min(360px, calc(100vw - 24px));
    border: 1px solid rgba(47, 47, 47, 0.16);
    border-radius: 8px;
    background: #fffffc;
    color: #2f2f2f;
    box-shadow: 0 12px 32px rgba(20, 20, 20, 0.14);
    padding: 6px;
    font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  #info-selection-toolbar.is-status {
    padding: 7px 10px;
    color: #6f6f6f;
    font-size: 12px;
  }
  #info-selection-toolbar.is-answer {
    display: block;
    width: 318px;
    padding: 10px;
  }
  #info-selection-toolbar button {
    height: 28px;
    border: 1px solid #d8d0c2;
    border-radius: 6px;
    background: #fffdfa;
    color: #2f2f2f;
    padding: 0 9px;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  #info-selection-toolbar button:first-child {
    background: #2f2f2f;
    color: #fff;
    border-color: #2f2f2f;
  }
  #info-selection-toolbar .info-selection-title {
    color: #6f6f6f;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0;
    margin-bottom: 5px;
  }
  #info-selection-toolbar .info-selection-body {
    max-height: 180px;
    overflow: auto;
    white-space: pre-wrap;
  }
  #info-selection-toolbar .info-selection-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 9px;
  }
  #info-writing-assist {
    position: absolute;
    z-index: 2147483647;
    width: 318px;
    max-width: calc(100vw - 24px);
    color: #2f2f2f;
    font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  #info-writing-assist.is-collapsed {
    width: auto;
  }
  #info-writing-assist .info-writing-trigger {
    display: none;
    height: 30px;
    border: 1px solid rgba(47, 47, 47, 0.2);
    border-radius: 999px;
    background: #2f2f2f;
    color: #fff;
    box-shadow: 0 8px 24px rgba(20, 20, 20, 0.14);
    padding: 0 10px;
    font: 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    cursor: pointer;
    user-select: none;
  }
  #info-writing-assist.is-idle .info-writing-trigger {
    background: #ffffff;
    color: #2f2f2f;
  }
  #info-writing-assist.is-pending .info-writing-trigger {
    opacity: .74;
  }
  #info-writing-assist.is-error .info-writing-trigger {
    background: #ffffff;
    color: #8a1f17;
    border-color: rgba(138, 31, 23, .34);
  }
  #info-writing-assist.is-collapsed .info-writing-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  #info-writing-assist .info-writing-panel {
    border: 1px solid rgba(47, 47, 47, 0.16);
    border-radius: 8px;
    background: #fffffc;
    color: #2f2f2f;
    box-shadow: 0 12px 32px rgba(20, 20, 20, 0.14);
    padding: 10px;
  }
  #info-writing-assist.is-collapsed .info-writing-panel {
    display: none;
  }
  #info-writing-assist .info-writing-title {
    color: #6f6f6f;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0;
    margin-bottom: 5px;
  }
  #info-writing-assist .info-writing-body {
    max-height: 96px;
    overflow: auto;
    white-space: pre-wrap;
  }
  #info-writing-assist .info-writing-actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    margin-top: 9px;
  }
  #info-writing-assist button {
    height: 28px;
    border: 1px solid #d8d0c2;
    border-radius: 6px;
    background: #fffdfa;
    color: #2f2f2f;
    padding: 0 9px;
    font: inherit;
    font-size: 12px;
  }
  #info-writing-assist button:last-child {
    background: #2f2f2f;
    color: #fff;
    border-color: #2f2f2f;
  }
`;
document.documentElement.append(style);

// ---------------------------------------------------------------------------
// Ambient: silent trigger + floating analyze button
// ---------------------------------------------------------------------------
// The user's request: while they are reading or interacting with a page, we
// quietly fire an ambient analysis request so a task shows up in the side
// panel Tasks tab. We never mutate the page or interrupt the user; this
// module only reads signals and posts a single fire-and-forget message.

const AMBIENT_FAB_ID = "info-ambient-fab";
const AMBIENT_DWELL_MS = 30_000;          // 30s dwell
const AMBIENT_SCROLL_THRESHOLD = 0.5;     // 50% scroll depth
const AMBIENT_SELECTION_MIN = 20;         // any 20+ char selection
const AMBIENT_DEDUPE_KEY_PREFIX = "info.ambient.lastFiredAt:";

let ambientLastFiredAt = 0;
let ambientDwellTimer: number | undefined;
let ambientFabEl: HTMLButtonElement | null = null;
let ambientDwellFired = false;
let ambientSelectionFired = false;

function ambientDedupeKey(): string {
  return `${AMBIENT_DEDUPE_KEY_PREFIX}${location.host}${location.pathname}`;
}

function ambientShouldFireFromDwell(): boolean {
  return !ambientDwellFired
    && Date.now() - startedAt >= AMBIENT_DWELL_MS
    && maxScrollDepth >= AMBIENT_SCROLL_THRESHOLD
    && scrollEvents >= 3;
}

function ambientMaybeFireFromDwell(): void {
  if (ambientDwellFired) return;
  if (!ambientShouldFireFromDwell()) return;
  ambientDwellFired = true;
  ambientFire("Silent ambient: dwelled on page and scrolled past 50%");
}

function ambientMaybeFireFromSelection(text: string): void {
  if (ambientSelectionFired) return;
  if (ambientDwellFired) return; // dwell already won
  if (text.length < AMBIENT_SELECTION_MIN) return;
  ambientSelectionFired = true;
  ambientFire(`Silent ambient: significant selection (${text.length} chars)`);
}

async function ambientFire(reason: string): Promise<void> {
  // Hard de-dupe: at most once every 90s per page, and once per URL per session.
  const now = Date.now();
  if (now - ambientLastFiredAt < 90_000) return;
  try {
    const dedupeKey = ambientDedupeKey();
    const stored = await chrome.storage.session?.get?.(dedupeKey).catch(() => ({} as Record<string, unknown>));
    const lastForUrl = typeof stored?.[dedupeKey] === "number" ? (stored[dedupeKey] as number) : 0;
    if (now - lastForUrl < 10 * 60_000) return;
    await chrome.storage.session?.set?.({ [dedupeKey]: now }).catch(() => undefined);
  } catch {
    // storage.session is unavailable in some contexts — fall back to time-only dedupe.
  }
  ambientLastFiredAt = now;
  try {
    await chrome.runtime.sendMessage({ type: "trigger-ambient", reason });
  } catch {
    // Background may be reloading; the next user-initiated trigger will recover.
  }
}

function ambientScheduleDwellCheck(): void {
  if (ambientDwellTimer) window.clearTimeout(ambientDwellTimer);
  // Poll every 5s once past the dwell threshold; cheap and predictable.
  ambientDwellTimer = window.setInterval(() => {
    if (ambientDwellFired) {
      if (ambientDwellTimer) window.clearInterval(ambientDwellTimer);
      return;
    }
    ambientMaybeFireFromDwell();
  }, 5_000);
}

function ambientMountFab(): void {
  if (document.getElementById(AMBIENT_FAB_ID)) return;
  const btn = document.createElement("button");
  btn.id = AMBIENT_FAB_ID;
  btn.type = "button";
  btn.setAttribute("aria-label", "Analyze this page with info ambient");
  btn.title = "Analyze this page with info ambient";
  btn.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg><span>Analyze</span>';
  btn.style.cssText = [
    "position: fixed",
    "right: 16px",
    "bottom: 16px",
    "z-index: 2147483646",
    "display: inline-flex",
    "align-items: center",
    "gap: 6px",
    "padding: 6px 10px",
    "border-radius: 9999px",
    "border: 1px solid rgba(0,0,0,0.12)",
    "background: rgba(255,255,255,0.92)",
    "color: #1f1f1f",
    "font: 12px/1 system-ui, -apple-system, sans-serif",
    "box-shadow: 0 6px 20px rgba(0,0,0,0.18)",
    "cursor: pointer",
    "backdrop-filter: blur(6px)",
    "transition: opacity .2s, transform .2s",
    "opacity: 0.85",
  ].join(";");
  btn.addEventListener("mouseenter", () => {
    btn.style.opacity = "1";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.opacity = "0.85";
  });
  btn.addEventListener("click", () => {
    btn.disabled = true;
    btn.textContent = "Queued…";
    chrome.runtime
      .sendMessage({ type: "trigger-ambient", reason: "Manual FAB click" })
      .catch(() => undefined)
      .finally(() => {
        window.setTimeout(() => {
          btn.disabled = false;
          btn.innerHTML =
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg><span>Analyze</span>';
        }, 1500);
      });
  });
  // Insert at the very end of <html> so we don't disturb page semantics.
  (document.body ?? document.documentElement).appendChild(btn);
  ambientFabEl = btn;
}

// Wire the silent ambient trigger to existing page signals. The scroll and
// selectionchange listeners above already update the module-level counters
// (maxScrollDepth / scrollEvents / selectionCount); we just add a dedicated
// listener that turns those counters into a fire-and-forget ambient request.
document.addEventListener("selectionchange", () => {
  const text = String(window.getSelection?.() ?? "").trim();
  if (text.length >= AMBIENT_SELECTION_MIN) ambientMaybeFireFromSelection(text);
}, true);

window.addEventListener("scroll", () => {
  ambientMaybeFireFromDwell();
}, { passive: true });

ambientScheduleDwellCheck();
ambientMountFab();

// ---------------------------------------------------------------------------
// YouTube comprehension gap capture (Stage 5)
// ---------------------------------------------------------------------------
// On youtube.com/watch we let the user press Shift+C to toggle the player's
// closed captions. We track how long captions stay on within a given window
// of the video; if a window accumulates above a threshold of caption-time
// while the user keeps pressing Shift+C, we emit a single
// observation.youtube.comprehension_gap record summarising the start/end
// timecodes and approximate transcript snippets. The language_learning
// program (Stage 7) picks those up and turns them into review queue items.

const YT_WATCH_PATH = "/watch";
const YT_GAP_KEY = "C";
const YT_GAP_FLUSH_AFTER_MS = 12_000;          // emit the gap after 12s of idle
const YT_GAP_MIN_TOTAL_MS = 8_000;              // ignore micro-gaps < 8s
const YT_SEND_DEBOUNCE_MS = 1_500;
const YT_RECENT_GAPS_KEY = "language.recent_caption_gaps";
const YT_RECENT_ACTIVE_WRITE_MS = 1_000;

type YtGap = {
  videoId: string;
  videoTitle: string;
  startTime: number;        // video seconds
  endTime: number;          // video seconds
  captionOnMs: number;      // accumulated caption-on milliseconds
  toggles: number;          // how many times the user pressed Shift+C
  transcriptSamples: string[];
  startedAt: string;        // ISO
};

let ytActive = false;
let ytPlayer: HTMLVideoElement | null = null;
let ytVideoId: string | null = null;
let ytVideoTitle: string | null = null;
let ytCurrentGap: YtGap | null = null;
let ytCaptionOn: boolean = false;
let ytVideoPaused: boolean = true;
let ytCaptionOnSince: number | null = null;
let ytFlushTimer: number | undefined;
let ytSendTimer: number | undefined;
let ytLastRecentWriteAt = 0;

function ytIsWatchPage(): boolean {
  return (location.hostname === "youtube.com" || location.hostname.endsWith(".youtube.com"))
    && location.pathname === YT_WATCH_PATH;
}

function ytExtractVideoId(): string | null {
  try {
    return new URLSearchParams(location.search).get("v");
  } catch {
    return null;
  }
}

function ytExtractVideoTitle(): string {
  const titleEl = document.querySelector("h1.ytd-watch-metadata yt-formatted-string")
    ?? document.querySelector("h1.title yt-formatted-string")
    ?? document.querySelector("meta[name=\"title\"]");
  if (titleEl instanceof HTMLMetaElement) return titleEl.content;
  if (titleEl) return (titleEl.textContent ?? "").trim();
  return document.title.replace(/ - YouTube$/, "");
}

function ytFindPlayer(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>("video.html5-main-video, video");
}

function ytGetPlayerTime(): number {
  return ytPlayer?.currentTime ?? 0;
}

function ytIsPlayerPaused(): boolean {
  return !ytPlayer || ytPlayer.paused || ytPlayer.ended;
}

function ytIsCaptionsOn(): boolean {
  // The captions button carries aria-pressed when captions are active.
  const btn = document.querySelector<HTMLElement>(".ytp-subtitles-button");
  if (!btn) return false;
  const pressed = btn.getAttribute("aria-pressed");
  if (pressed === "true") return true;
  // Fall back to URL parameter; YouTube persists the user's choice in the cc lang prefs.
  const track = document.querySelector("video > track[kind=\"captions\"][default], video > track[kind=\"subtitles\"][default]");
  return Boolean(track);
}

function ytReadCaptionText(): string | null {
  // YouTube often renders the visible caption as multiple segment nodes.
  const segments = Array.from(document.querySelectorAll<HTMLElement>(
    ".ytp-caption-window-container .ytp-caption-segment, .caption-window .captions-text",
  ))
    .map(slot => (slot.textContent ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const joined = segments.join(" ").replace(/\s+/g, " ").trim();
  return joined || null;
}

function ytStartFreshGap(): void {
  if (!ytVideoId) return;
  ytCurrentGap = {
    videoId: ytVideoId,
    videoTitle: ytVideoTitle ?? "",
    startTime: ytGetPlayerTime(),
    endTime: ytGetPlayerTime(),
    captionOnMs: 0,
    toggles: 0,
    transcriptSamples: [],
    startedAt: new Date().toISOString(),
  };
}

function ytExtendGap(): void {
  if (!ytCurrentGap) return;
  const now = ytGetPlayerTime();
  if (now > ytCurrentGap.endTime) ytCurrentGap.endTime = now;
  const sample = ytReadCaptionText();
  if (sample && !ytCurrentGap.transcriptSamples.includes(sample)) {
    ytCurrentGap.transcriptSamples.push(sample);
    if (ytCurrentGap.transcriptSamples.length > 6) ytCurrentGap.transcriptSamples.shift();
  }
  if (ytCaptionOn && Date.now() - ytLastRecentWriteAt > YT_RECENT_ACTIVE_WRITE_MS) {
    ytLastRecentWriteAt = Date.now();
    void rememberCurrentCaptionGap("active");
  }
}

function ytStartCaptionFragment(reason: "keyboard" | "button" | "poll" | "play"): void {
  if (!ytVideoId) return;
  ytStartFreshGap();
  ytCaptionOnSince = Date.now();
  if (ytCurrentGap) ytCurrentGap.toggles += reason === "poll" || reason === "play" ? 0 : 1;
  ytLastRecentWriteAt = 0;
  void rememberCurrentCaptionGap("active");
}

function ytScheduleFlush(): void {
  if (ytFlushTimer) window.clearTimeout(ytFlushTimer);
  ytFlushTimer = window.setTimeout(() => {
    if (ytCurrentGap && ytCurrentGap.captionOnMs >= YT_GAP_MIN_TOTAL_MS) {
      ytFlushGap();
    } else {
      ytCurrentGap = null;
    }
  }, YT_GAP_FLUSH_AFTER_MS);
}

function ytFlushGap(): void {
  const gap = ytCurrentGap;
  ytCurrentGap = null;
  ytSendGap(gap);
}

function ytSendGap(gap: YtGap | null): void {
  if (!gap || gap.captionOnMs < YT_GAP_MIN_TOTAL_MS) return;
  // Debounce the actual send so a flurry of toggles coalesces into one record.
  if (ytSendTimer) window.clearTimeout(ytSendTimer);
  ytSendTimer = window.setTimeout(() => {
    const payload = {
      video_id: gap.videoId,
      video_title: gap.videoTitle,
      video_url: location.href,
      start_seconds: gap.startTime,
      end_seconds: gap.endTime,
      caption_on_ms: gap.captionOnMs,
      toggles: gap.toggles,
      transcript_samples: gap.transcriptSamples,
      observed_at: gap.startedAt,
    };
    void rememberRecentCaptionGap(payload, "sent");
    void chrome.runtime.sendMessage({
      type: "youtube-comprehension-gap",
      gap: payload,
    }).catch(() => undefined);
  }, YT_SEND_DEBOUNCE_MS);
}

function ytFinishCaptionFragment(): void {
  if (!ytCurrentGap) {
    ytCaptionOnSince = null;
    return;
  }
  if (ytCaptionOnSince) {
    ytCurrentGap.captionOnMs += Date.now() - ytCaptionOnSince;
    ytCaptionOnSince = null;
  }
  const sample = ytReadCaptionText();
  if (sample && !ytCurrentGap.transcriptSamples.includes(sample)) {
    ytCurrentGap.transcriptSamples.push(sample);
    if (ytCurrentGap.transcriptSamples.length > 6) ytCurrentGap.transcriptSamples.shift();
  }
  void rememberCurrentCaptionGap("sent");
  const gap = ytCurrentGap;
  ytCurrentGap = null;
  ytSendGap(gap);
}

async function rememberCurrentCaptionGap(status: "active" | "sent"): Promise<void> {
  if (!ytCurrentGap) return;
  const activeDelta = ytCaptionOnSince ? Date.now() - ytCaptionOnSince : 0;
  await rememberRecentCaptionGap({
    video_id: ytCurrentGap.videoId,
    video_title: ytCurrentGap.videoTitle,
    video_url: location.href,
    start_seconds: ytCurrentGap.startTime,
    end_seconds: ytCurrentGap.endTime,
    caption_on_ms: ytCurrentGap.captionOnMs + activeDelta,
    toggles: ytCurrentGap.toggles,
    transcript_samples: ytCurrentGap.transcriptSamples,
    current_caption: ytReadCaptionText(),
    observed_at: ytCurrentGap.startedAt,
  }, status);
}

async function rememberRecentCaptionGap(gap: any, status: "active" | "sent"): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      type: "language.caption_gap.recent",
      storage_key: YT_RECENT_GAPS_KEY,
      gap,
      status,
    });
  } catch {
    // Recent segments are best-effort UI state; the server observation remains the source of truth.
  }
}

function ytApplyCaptionState(nextOn: boolean, reason: "keyboard" | "button" | "poll"): void {
  if (nextOn === ytCaptionOn) return;
  ytCaptionOn = nextOn;
  if (ytCaptionOn) {
    if (!ytIsPlayerPaused()) ytStartCaptionFragment(reason);
  } else {
    ytFinishCaptionFragment();
  }
}

function ytApplyPlaybackState(): void {
  const paused = ytIsPlayerPaused();
  if (paused === ytVideoPaused) return;
  ytVideoPaused = paused;
  if (!ytCaptionOn) return;
  if (paused) {
    ytFinishCaptionFragment();
  } else {
    ytStartCaptionFragment("play");
  }
}

function ytIsEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : null;
  if (!element) return false;
  return Boolean(element.closest("input,textarea,[contenteditable='true'],[contenteditable='plaintext-only']"));
}

function ytBind(): void {
  if (!ytIsWatchPage()) return;
  if (ytActive) return;
  ytActive = true;
  ytPlayer = ytFindPlayer();
  ytVideoId = ytExtractVideoId();
  ytVideoTitle = ytExtractVideoTitle();
  ytVideoPaused = ytIsPlayerPaused();

  // Periodically extend the current gap and read captions.
  window.setInterval(() => {
    if (!ytActive) return;
    if (!ytPlayer) ytPlayer = ytFindPlayer();
    if (!ytVideoId) ytVideoId = ytExtractVideoId();
    if (!ytVideoTitle) ytVideoTitle = ytExtractVideoTitle();
    ytApplyCaptionState(ytIsCaptionsOn(), "poll");
    ytApplyPlaybackState();
    if (ytCaptionOn && !ytIsPlayerPaused()) {
      ytExtendGap();
    }
  }, 750);

  document.addEventListener("keydown", (event) => {
    if (!ytActive) return;
    if ((event.key === "C" || event.key === "c") && !event.altKey && !event.metaKey && !event.ctrlKey && !ytIsEditableTarget(event.target)) {
      // Plain C is YouTube's native subtitle shortcut. Shift+C is our
      // explicit alternate shortcut, so synthesize the same CC button click.
      if (event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        document.querySelector<HTMLElement>(".ytp-subtitles-button")?.click();
      }
      window.setTimeout(() => ytApplyCaptionState(ytIsCaptionsOn(), "keyboard"), 120);
    }
  }, true);

  // SPA navigation: re-bind when the URL changes to a new /watch?v=...
  let lastHref = location.href;
  window.setInterval(() => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    if (ytIsWatchPage()) {
      ytFlushGap();
      ytVideoId = ytExtractVideoId();
      ytVideoTitle = ytExtractVideoTitle();
      ytCurrentGap = null;
      ytCaptionOn = false;
      ytVideoPaused = ytIsPlayerPaused();
      ytCaptionOnSince = null;
    }
  }, 1_000);
}

ytBind();
window.setInterval(() => {
  if (!ytActive && ytIsWatchPage()) ytBind();
}, 1_000);
