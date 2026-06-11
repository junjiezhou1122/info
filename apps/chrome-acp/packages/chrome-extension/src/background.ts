import { handleInfoCaptureMessage, installInfoCaptureDefaults, startInfoCapture } from "./lib/info-capture";

let pendingSidepanelPrompt: any = null;
const RECENT_CAPTION_GAPS_KEY = "language.recent_caption_gaps";
const MAX_RECENT_CAPTION_GAPS = 12;

chrome.runtime.onInstalled.addListener(async () => {
  await installInfoCaptureDefaults();
  if (chrome.sidePanel?.setPanelBehavior) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
  }
});

startInfoCapture();

// Open side panel when the extension icon is clicked.
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === "language.caption_gap.recent") {
      const gap = message.gap ?? {};
      const status = message.status === "sent" ? "sent" : "active";
      const observedKey = typeof gap.observed_at === "string" ? Date.parse(gap.observed_at) : 0;
      const fragmentKey = Number.isFinite(observedKey) && observedKey > 0 ? observedKey : Date.now();
      const id = status === "active"
        ? `${gap.video_id ?? "unknown"}:${Math.round(Number(gap.start_seconds) || 0)}:${fragmentKey}:active`
        : `${gap.video_id ?? "unknown"}:${Math.round(Number(gap.start_seconds) || 0)}-${Math.round(Number(gap.end_seconds) || 0)}:${fragmentKey}`;
      const stored = await chrome.storage?.session?.get?.(RECENT_CAPTION_GAPS_KEY).catch(() => ({}));
      const current = Array.isArray(stored?.[RECENT_CAPTION_GAPS_KEY]) ? stored[RECENT_CAPTION_GAPS_KEY] : [];
      const videoId = gap.video_id ?? "unknown";
      const startSeconds = Math.round(Number(gap.start_seconds) || 0);
      const activeId = `${videoId}:${startSeconds}:${fragmentKey}:active`;
      const withoutSame = current.filter((item: any) => {
        if (item?.id === id || item?.id === activeId) return false;
        return !(item?.video_id === gap.video_id
          && Math.round(Number(item?.start_seconds) || 0) === startSeconds
          && item?.observed_at === gap.observed_at);
      });
      const next = [
        {
          ...gap,
          id,
          status,
          captured_at: new Date().toISOString(),
        },
        ...withoutSame,
      ].slice(0, MAX_RECENT_CAPTION_GAPS);
      await chrome.storage?.session?.set?.({ [RECENT_CAPTION_GAPS_KEY]: next }).catch(() => undefined);
      sendResponse({ ok: true, id, count: next.length });
      return;
    }

    if (message?.type === "sidepanel.explain.selection" || message?.type === "sidepanel.run.selection_action") {
      const tab = sender.tab;
      pendingSidepanelPrompt = {
        type: "selection-action",
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        action: message.action ?? {
          id: "explain",
          label: "Explain",
          prompt: "Explain this selected text in plain language. Keep it concise, and mention the page context if it matters.",
        },
        payload: message.payload,
      };
      if (tab?.id) await chrome.sidePanel.open({ tabId: tab.id }).catch(() => undefined);
      sendResponse({ ok: true, pending: pendingSidepanelPrompt });
      return;
    }

    if (message?.type === "sidepanel.consume-pending-prompt") {
      const pending = pendingSidepanelPrompt;
      pendingSidepanelPrompt = null;
      sendResponse({ ok: true, pending });
      return;
    }

    const result = await handleInfoCaptureMessage(message, sender);
    if (result !== undefined) sendResponse(result);
  })().catch(error => {
    sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
  });
  return true;
});
