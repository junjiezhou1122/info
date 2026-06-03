let maxScrollDepth = 0;
let scrollEvents = 0;
let selectionCount = 0;
let lastSelectedText = "";
let selectionTimer = null;
let writingTimer = null;
let lastWritingText = "";
let activeWritingElement = null;
let assistBubble = null;
let pendingInsertedDraftEdit = null;
let insertedDraftEditTimer = null;
const startedAt = Date.now();

function visibleText() {
  const clone = document.body?.cloneNode(true);
  if (!clone) return "";
  clone.querySelectorAll("script,style,noscript,svg,canvas,iframe,nav,footer").forEach((el) => el.remove());
  return clone.textContent.replace(/\s+/g, " ").trim().slice(0, 120_000);
}


function textQuality(text) {
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
  const pick = (selector, attr = "content") => document.querySelector(selector)?.getAttribute(attr) || undefined;
  return {
    description: pick('meta[name="description"]'),
    og_title: pick('meta[property="og:title"]'),
    og_description: pick('meta[property="og:description"]'),
    canonical_url: document.querySelector('link[rel="canonical"]')?.href || undefined,
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
  if (!selectedText) return undefined;
  const range = selection.rangeCount ? selection.getRangeAt(0) : undefined;
  const node = range?.commonAncestorContainer;
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  const rect = range?.getBoundingClientRect?.();
  const surroundingText = element?.innerText?.replace(/\s+/g, " ").trim().slice(0, 2000);
  return {
    kind,
    selected_text: selectedText,
    surrounding_text: surroundingText,
    selection_length: selectedText.length,
    tag: element?.tagName,
    url: location.href,
    title: document.title,
    domain: location.hostname,
    canonical_url: document.querySelector('link[rel="canonical"]')?.href || location.href,
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
  return {
    title: document.title,
    url: location.href,
    domain: location.hostname,
    text: visibleText(),
    selected_text: selected,
    scroll_depth: maxScrollDepth,
    scroll_events: scrollEvents,
    selection_count: selectionCount,
    page_active_seconds: Math.round((Date.now() - startedAt) / 1000),
    observed_at: new Date().toISOString(),
    metadata: metadata(),
    text_quality: textQuality(visibleText()),
    search: searchQueryInfo(),
  };
}

function sendAttention(kind) {
  const payload = selectionContext(kind);
  if (!payload || payload.selected_text.length < 3) return;
  chrome.runtime.sendMessage({ type: "context.capture.browser_attention", kind, payload }).catch(() => undefined);
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
  selectionTimer = setTimeout(() => sendAttention("selected"), 650);
});

document.addEventListener("copy", () => {
  setTimeout(() => sendAttention("copied"), 0);
});

document.addEventListener("input", (event) => {
  const target = editableElement(event.target);
  if (!target) return;
  const text = editableText(target);
  observeInsertedDraftEdit(target, text);
  if (!shouldSendWritingText(text, target)) return;
  activeWritingElement = target;
  clearTimeout(writingTimer);
  writingTimer = setTimeout(() => sendWritingInput(target, text), 900);
}, true);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "collect-page-context") {
    sendResponse(collectPageContext());
    return true;
  }
});

function editableElement(target) {
  const element = target instanceof Element ? target : target?.parentElement;
  if (!element) return undefined;
  const editable = element.closest("textarea,input,[contenteditable='true'],[contenteditable='plaintext-only']");
  if (!editable) return undefined;
  if (editable instanceof HTMLInputElement) {
    const type = (editable.type || "text").toLowerCase();
    if (!["text", "search", "url", "email", "tel"].includes(type)) return undefined;
  }
  return editable;
}

function editableText(element) {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) return element.value;
  return element.textContent || "";
}

function shouldSendWritingText(text, element) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length < 24 || normalized.length > 5000) return false;
  if (normalized === lastWritingText) return false;
  if (element instanceof HTMLInputElement && normalized.length < 40) return false;
  if (sensitiveEditable(element)) return false;
  lastWritingText = normalized;
  return true;
}

function sensitiveEditable(element) {
  return /password|token|secret|api[_-]?key|credit card|验证码|密码/i.test(`${element.id || ""} ${element.getAttribute("name") || ""} ${element.getAttribute("autocomplete") || ""}`);
}

function sendWritingInput(element, text) {
  const rect = element.getBoundingClientRect();
  chrome.runtime.sendMessage({
    type: "context.capture.writing_input",
    payload: {
      title: document.title,
      url: location.href,
      domain: location.hostname,
      text,
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
  }).then(result => showWritingAssist(result, element)).catch(() => undefined);
}

function showWritingAssist(result, element) {
  const view = writingViewFromResult(result);
  const draft = draftTextFromView(view);
  const suggestions = suggestionsFromView(view);
  if (!view || (!draft && !suggestions.length)) return;
  removeAssistBubble();
  assistBubble = document.createElement("div");
  assistBubble.id = "info-writing-assist";
  assistBubble.innerHTML = "";
  const title = document.createElement("div");
  title.className = "info-writing-title";
  title.textContent = view.view_type === "draft.writing_continuation" ? "Info draft" : "Info writing";
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
      payload: {
        action: "dismiss",
        surface: "writing_inline",
        draft_text: draft || undefined,
        suggestion_count: suggestions.length,
      },
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
        payload: {
          action: "insert",
          surface: "writing_inline",
          draft_text: draft,
          original_text: beforeText,
          edited_text: afterText,
        },
      });
      removeAssistBubble();
    });
    actions.append(insert);
  }
  assistBubble.append(title, body, actions);
  document.documentElement.append(assistBubble);
  positionAssistBubble(element);
}

function writingViewFromResult(result) {
  const views = Array.isArray(result?.views) ? result.views.map(item => item?.view).filter(Boolean) : [];
  return views.find(view => view.view_type === "draft.writing_continuation")
    || views.find(view => view.view_type === "advice.writing_assist");
}

function draftTextFromView(view) {
  const value = view?.content?.draft_text || view?.summary;
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function suggestionsFromView(view) {
  const value = view?.content?.suggestions;
  return Array.isArray(value) ? value.filter(item => typeof item === "string" && item.trim()) : [];
}

function submitWritingFeedback(view, input) {
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

function rememberInsertedDraftForEdit(element, view, draft, beforeText, afterText) {
  if (!view?.id || !draft || sensitiveEditable(element)) return;
  clearTimeout(insertedDraftEditTimer);
  pendingInsertedDraftEdit = {
    element,
    view,
    draft,
    beforeText,
    insertedText: afterText,
    lastText: afterText,
    createdAt: Date.now(),
    sent: false,
  };
}

function observeInsertedDraftEdit(element, text) {
  const pending = pendingInsertedDraftEdit;
  if (!pending || pending.sent || pending.element !== element) return;
  if (Date.now() - pending.createdAt > 120_000 || sensitiveEditable(element)) {
    clearPendingInsertedDraftEdit();
    return;
  }
  if (normalizeWriting(text) === normalizeWriting(pending.insertedText)) return;
  pending.lastText = text;
  clearTimeout(insertedDraftEditTimer);
  insertedDraftEditTimer = setTimeout(() => flushInsertedDraftEditFeedback(), 1800);
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
  insertedDraftEditTimer = null;
  pendingInsertedDraftEdit = null;
}

function normalizeWriting(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function insertDraft(element, draft) {
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
  element.focus();
  document.execCommand("insertText", false, `${editableText(element).trim() ? " " : ""}${draft}`);
}

function positionAssistBubble(element) {
  if (!assistBubble) return;
  const rect = element.getBoundingClientRect();
  const top = Math.min(window.innerHeight - 120, Math.max(12, rect.bottom + 8));
  const left = Math.min(window.innerWidth - 330, Math.max(12, rect.left));
  assistBubble.style.top = `${top + window.scrollY}px`;
  assistBubble.style.left = `${left + window.scrollX}px`;
}

function removeAssistBubble() {
  assistBubble?.remove();
  assistBubble = null;
}

const style = document.createElement("style");
style.textContent = `
  #info-writing-assist {
    position: absolute;
    z-index: 2147483647;
    width: 318px;
    max-width: calc(100vw - 24px);
    border: 1px solid rgba(47, 47, 47, 0.18);
    border-radius: 8px;
    background: #fffdf8;
    color: #2f2f2f;
    box-shadow: 0 18px 48px rgba(20, 20, 20, 0.16);
    padding: 10px;
    font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  #info-writing-assist .info-writing-title {
    color: #6f6f6f;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .04em;
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
