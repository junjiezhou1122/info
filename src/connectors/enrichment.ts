import type { ContextRecord, StoredContextRecord, StoredContextView } from "../core/types.js";
import type { ContextStore } from "../core/store.js";

const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_READER_TEXT = 250_000;

const BLOCKED_PROTOCOLS = new Set(["chrome:", "chrome-extension:", "edge:", "about:", "file:", "data:", "blob:"]);
const PRIVATE_HOST_RE = /(gmail|mail|icloud|bank|paypal|stripe|checkout|1password|bitwarden|lastpass|login|account)/i;
const PRIVATE_PATH_RE = /(login|signin|account|checkout|payment|password|token|secret|oauth|auth)/i;

export function shouldReaderEnrich(record: ContextRecord): { ok: boolean; reason?: string } {
  const url = record.content?.url;
  if (!url) return { ok: false, reason: "missing url" };
  if (record.privacy?.retention === "do_not_store") return { ok: false, reason: "do_not_store" };
  if (record.privacy?.level === "secret") return { ok: false, reason: "secret privacy" };
  if (record.payload?.reader_enrichment === false) return { ok: false, reason: "reader_enrichment disabled" };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "invalid url" };
  }
  if (BLOCKED_PROTOCOLS.has(parsed.protocol)) return { ok: false, reason: `blocked protocol ${parsed.protocol}` };
  if (!["http:", "https:"].includes(parsed.protocol)) return { ok: false, reason: `unsupported protocol ${parsed.protocol}` };
  if (PRIVATE_HOST_RE.test(parsed.hostname) || PRIVATE_PATH_RE.test(parsed.pathname)) return { ok: false, reason: "privacy url pattern" };
  if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname.endsWith(".local")) {
    return { ok: false, reason: "local/private host" };
  }
  return { ok: true };
}

export async function enrichWithJinaReader(store: ContextStore, parent: StoredContextRecord): Promise<StoredContextView | undefined> {
  const gate = shouldReaderEnrich(parent);
  if (!gate.ok) return undefined;

  const targetUrl = parent.content?.url;
  if (!targetUrl) return undefined;
  const readerUrl = `https://r.jina.ai/${targetUrl}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(readerUrl, {
      signal: controller.signal,
      headers: {
        "Accept": "text/plain, text/markdown;q=0.9, */*;q=0.1",
        "User-Agent": "personal-context-layer/0.0.1",
      },
    });
    const text = await response.text();
    const ok = response.ok && text.trim().length > 0;
    return store.upsertView({
      id: `extraction:reader-snapshot:${parent.id}`,
      view_type: "extraction.reader_snapshot",
      title: parent.content?.title ?? `Reader snapshot: ${targetUrl}`,
      summary: ok ? `Reader snapshot for ${targetUrl}` : `Reader enrichment failed: HTTP ${response.status}`,
      status: ok && parent.signal?.status !== "inbox" ? parent.signal?.status ?? "candidate" : "candidate",
      source_records: [parent.id],
      compiler: { id: "reader.jina", version: "0.1.0", mode: "deterministic" },
      purpose: "Extract readable page text from a browser Observation for downstream Programs.",
      scope: parent.scope,
      content: {
        url: targetUrl,
        text: ok ? text.slice(0, MAX_READER_TEXT) : `Reader enrichment failed: HTTP ${response.status}\n${text.slice(0, 2000)}`,
        provider: "jina",
        reader_url: readerUrl,
        http_status: response.status,
        ok,
        fetched_at: new Date().toISOString(),
        source_schema: parent.schema,
      },
      confidence: ok ? 0.85 : 0.2,
      stability: "session",
      lossiness: "low",
      privacy: parent.privacy,
      metadata: {
        parent_record_id: parent.id,
      },
    });
  } catch (error: any) {
    return store.upsertView({
      id: `extraction:reader-snapshot:${parent.id}`,
      view_type: "extraction.reader_snapshot",
      title: parent.content?.title ?? `Reader snapshot failed: ${targetUrl}`,
      summary: `Reader enrichment failed: ${error?.message ?? String(error)}`,
      status: "candidate",
      source_records: [parent.id],
      compiler: { id: "reader.jina", version: "0.1.0", mode: "deterministic" },
      purpose: "Extract readable page text from a browser Observation for downstream Programs.",
      scope: parent.scope,
      content: {
        url: targetUrl,
        text: `Reader enrichment failed: ${error?.message ?? String(error)}`,
        provider: "jina",
        reader_url: readerUrl,
        ok: false,
        error: error?.message ?? String(error),
        fetched_at: new Date().toISOString(),
      },
      confidence: 0.1,
      stability: "session",
      lossiness: "high",
      privacy: parent.privacy,
      metadata: { parent_record_id: parent.id },
    });
  } finally {
    clearTimeout(timer);
  }
}

export function shouldAutoEnrichBrowserRecord(record: ContextRecord): boolean {
  return record.schema.name === "observation.browser_page_saved" || record.schema.name === "observation.browser_page_snapshot";
}
