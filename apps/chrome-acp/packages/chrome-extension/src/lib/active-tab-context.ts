// Build a short text block describing the active tab so the agent can
// answer "what is on this page" without first calling browser_tabs.
//
// Strategy:
//   1. chrome.tabs.query for the active tab in the current window.
//   2. Try to extract visible text + selected text by injecting a content
//      script. Fall back to just url+title if the content script is
//      unavailable (e.g. chrome:// pages, the extension store, PDFs).
//   3. Cache page text by URL. On the same URL, still resend a compact
//      url/title/excerpt block so follow-up questions cannot drift to another
//      browser or tool context.
//
// The returned string is plain text formatted like:
//
//   Current browser tab (auto-injected by the chrome-acp side panel):
//   URL: https://example.com/post/123
//   Title: ...
//   Excerpt: <visible text, first injection for this URL only>
//   Selected text: <user-highlighted text if any>
//
// It is intended to be prepended to the user's prompt before being sent
// to the ACP agent. Always returns a non-empty string when there is an
// active tab; returns null if the call cannot find a tab.

const MAX_TITLE_CHARS = 240;
const MAX_URL_CHARS = 2000;
const MAX_EXCERPT_CHARS = 2000;
const MAX_CACHED_EXCERPT_CHARS = 900;
const MAX_PREVIEW_CHARS = 180;

export interface ActiveTabContextPreview {
  id: string;
  kind: "page" | "selection";
  label: string;
  source: string;
  title: string;
  detail: string;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

// ---------------------------------------------------------------------------
// Module-level cache keyed by URL. Page text is expensive and stable enough to
// reuse across same-page submits. Selection is intentionally not cached.
// ---------------------------------------------------------------------------
let _cachedUrl: string | null = null;
let _cachedText: string | null = null;
let _cachedPageContextInjected = false;
let _lastMeaningfulTabId: number | null = null;
let _lastMeaningfulTabAt = 0;

const MEANINGFUL_TAB_TTL_MS = 30 * 60_000;

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  if (typeof chrome === "undefined" || !chrome.tabs?.query) return null;
  try {
    const tabs = await getCandidateTabs();
    const chosen = tabs.find(shouldUseAsPageContext);
    if (chosen) {
      rememberMeaningfulTab(chosen);
      return chosen;
    }
    const remembered = await getRememberedMeaningfulTab();
    if (remembered) return remembered;
    return tabs[0] ?? null;
  } catch (error) {
    console.warn("[active-tab-context] chrome.tabs.query failed:", error);
    return null;
  }
}

async function getCandidateTabs(): Promise<chrome.tabs.Tab[]> {
  const windows = await chrome.windows?.getAll?.({ populate: true, windowTypes: ["normal"] }).catch(() => []);
  const windowTabs = Array.isArray(windows)
    ? windows
        .filter(window => window.state !== "minimized")
        .sort((a, b) => Number(Boolean(b.focused)) - Number(Boolean(a.focused)))
        .flatMap(window => (window.tabs ?? []).filter(tab => tab.active))
    : [];
  const [currentWindowTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [lastFocusedTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return dedupeTabs([currentWindowTab, lastFocusedTab, ...windowTabs].filter(Boolean) as chrome.tabs.Tab[])
    .sort((a, b) => tabContextScore(b) - tabContextScore(a));
}

async function getRememberedMeaningfulTab(): Promise<chrome.tabs.Tab | null> {
  if (!_lastMeaningfulTabId || Date.now() - _lastMeaningfulTabAt > MEANINGFUL_TAB_TTL_MS) return null;
  const tab = await chrome.tabs.get(_lastMeaningfulTabId).catch(() => null);
  return tab && shouldUseAsPageContext(tab) ? tab : null;
}

function rememberMeaningfulTab(tab: chrome.tabs.Tab): void {
  if (!tab.id || !shouldUseAsPageContext(tab)) return;
  _lastMeaningfulTabId = tab.id;
  _lastMeaningfulTabAt = Date.now();
}

function dedupeTabs(tabs: chrome.tabs.Tab[]): chrome.tabs.Tab[] {
  const seen = new Set<number>();
  const result: chrome.tabs.Tab[] = [];
  for (const tab of tabs) {
    if (!tab?.id || seen.has(tab.id)) continue;
    seen.add(tab.id);
    result.push(tab);
  }
  return result;
}

function shouldUseAsPageContext(tab: chrome.tabs.Tab): boolean {
  const url = tab.url || "";
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return false;
  if (isMetaflowSelfUrl(parsed)) return false;
  if (isBrowserChromeNoiseUrl(parsed)) return false;
  return true;
}

function isMetaflowSelfUrl(url: URL): boolean {
  return ["localhost", "127.0.0.1"].includes(url.hostname) && ["5177", "5173"].includes(url.port);
}

function isBrowserChromeNoiseUrl(url: URL): boolean {
  const host = url.hostname;
  return host === "ogs.google.com"
    || host === "tpc.googlesyndication.com"
    || host.endsWith(".gstatic.com")
    || host.endsWith(".googleusercontent.com");
}

function tabContextScore(tab: chrome.tabs.Tab): number {
  const url = tab.url || "";
  let parsed: URL | undefined;
  try { parsed = new URL(url); } catch {}
  let score = 0;
  if (tab.active) score += 20;
  if (tab.highlighted) score += 5;
  if (parsed?.hostname.includes("youtube.com") && parsed.pathname === "/watch") score += 80;
  if (parsed?.hostname === "youtu.be") score += 70;
  if (tab.title) score += 4;
  if (parsed && isMetaflowSelfUrl(parsed)) score -= 200;
  return score;
}

async function readTabContent(tabId: number): Promise<{ text: string | null; selected: string | null }> {
  if (!chrome.scripting?.executeScript) return { text: null, selected: null };
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Visible text (same logic the existing content script uses)
        const clone = document.body?.cloneNode(true);
        let text = "";
        if (clone) {
          clone.querySelectorAll("script,style,noscript,svg,canvas,iframe,nav,footer").forEach((el) => el.remove());
          text = (clone.textContent ?? "").replace(/\s+/g, " ").trim();
        }

        // User-selected text via window.getSelection()
        const sel = window.getSelection();
        const selected = sel && sel.toString().trim();

        return { text, selected: selected ?? null };
      },
    });
    const first = results?.[0]?.result;
    if (first && typeof first === "object") {
      return {
        text: typeof first.text === "string" ? first.text : null,
        selected: typeof first.selected === "string" ? first.selected : null,
      };
    }
    return { text: null, selected: null };
  } catch (error) {
    // Restricted pages (chrome://, the web store, file://) throw.
    console.debug("[active-tab-context] executeScript skipped:", (error as Error).message);
    return { text: null, selected: null };
  }
}

async function readTabSelection(tabId: number): Promise<string | null> {
  if (!chrome.scripting?.executeScript) return null;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.getSelection()?.toString().trim() || null,
    });
    const selected = results?.[0]?.result;
    return typeof selected === "string" && selected ? selected : null;
  } catch (error) {
    console.debug("[active-tab-context] selection preview skipped:", (error as Error).message);
    return null;
  }
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export async function previewActiveTabContext(): Promise<ActiveTabContextPreview | null> {
  const tab = await getActiveTab();
  if (!tab || !tab.id || !tab.url) return null;

  const url = truncate(tab.url, MAX_URL_CHARS);
  const title = tab.title ? truncate(tab.title, MAX_TITLE_CHARS) : "(untitled)";
  const selected = await readTabSelection(tab.id);
  const source = hostFromUrl(url);

  if (selected) {
    const normalized = selected.replace(/\s+/g, " ").trim();
    return {
      id: `selection:${url}:${normalized}`,
      kind: "selection",
      label: `Selected text (${wordCount(normalized)} words)`,
      source,
      title,
      detail: truncate(normalized, MAX_PREVIEW_CHARS),
    };
  }

  return {
    id: `page:${url}`,
    kind: "page",
    label: "Current page",
    source,
    title,
    detail: url,
  };
}

export async function buildActiveTabContext(): Promise<string | null> {
  const tab = await getActiveTab();
  if (!tab || !tab.id || !tab.url) return null;

  const url = truncate(tab.url, MAX_URL_CHARS);

  let excerptRaw: string | null;
  let selected: string | null;
  let includeFreshPageContext = false;

  if (_cachedUrl === url && _cachedPageContextInjected) {
    console.debug("[active-tab-context] CACHE HIT for:", url);
    excerptRaw = _cachedText;
    selected = await readTabSelection(tab.id);
  } else {
    console.debug("[active-tab-context] CACHE MISS for:", url);
    const content = await readTabContent(tab.id);
    excerptRaw = content.text;
    selected = content.selected;
    _cachedUrl = url;
    _cachedText = excerptRaw;
    _cachedPageContextInjected = true;
    includeFreshPageContext = true;
  }

  const title = tab.title ? truncate(tab.title, MAX_TITLE_CHARS) : "(untitled)";

  const lines = [
    "Current browser tab (authoritative chrome-acp side panel context):",
    `URL: ${url}`,
    `Title: ${title}`,
    "Instruction: Answer questions about the current page from this Chrome tab context. Do not use unrelated DevTools, Browser MCP, or about:blank state as the current page unless this URL/title says so.",
  ];
  if (excerptRaw) {
    lines.push(`Excerpt: ${truncate(excerptRaw, includeFreshPageContext ? MAX_EXCERPT_CHARS : MAX_CACHED_EXCERPT_CHARS)}`);
  }
  if (selected) lines.push(`Selected text: ${selected}`);

  return lines.join("\n");
}

// Export a way to force-clear the cache (useful when navigating)
export function clearActiveTabCache(): void {
  _cachedUrl = null;
  _cachedText = null;
  _cachedPageContextInjected = false;
}
