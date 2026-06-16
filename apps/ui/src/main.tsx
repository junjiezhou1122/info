import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { fetchActivityTimeline, fetchContextView, fetchRuntimeSettings, fetchScreenpipeFrameContext, fetchViewFamilies, fetchViewsByType, fetchViewsByTypes, runRuntimeTick, saveRuntimeSettings, screenpipeFrameUrl, submitViewFeedback, syncScreenpipe } from "./api";
import type { ActivityTimelineResponse, ContextViewSummary, RuntimeSettings, RuntimeTickResponse, TimelineBucket, TimelineItem, ViewCatalogResponse, ViewFamiliesResponse, ViewFamilyDefinition, ViewFamilySummary } from "./types";
import "./styles.css";

const POLL_MS = 60_000;
const DEFAULT_MINUTES = 60;
const FALLBACK_VIEW_TYPE_ORDER = [
  "evidence", "visual_frame", "audio", "activity", "activity_block", "proposal", "resource", "intent", "workflow", "memory",
  "thread.active_work", "project.current_context", "brief.research", "brief.background_research",
  "advice.research", "advice.writing_assist",
  "task.background_research", "draft.writing_continuation",
  "opportunity.tool", "task.toolsmith_prototype", "draft.tool_prototype", "tool.prototype_artifact",
  "app.language.review_queue", "memory.language.difficult_segments",
];
const AMBIENT_VIEW_TYPES = [
  "advice.research",
  "task.background_research",
  "brief.background_research",
  "advice.writing_assist",
  "draft.writing_continuation",
  "opportunity.tool",
  "task.toolsmith_prototype",
  "draft.tool_prototype",
  "tool.prototype_artifact",
  "app.language.review_queue",
  "memory.language.difficult_segments",
];
const VIEW_CATALOG_CACHE = new Map<string, ViewFamilyDefinition>();
let VIEW_CATALOG_ORDER_CACHE: string[] = FALLBACK_VIEW_TYPE_ORDER;
type SourceFilter = "screenpipe" | "browser" | "runtime" | "all";
type DetailMode = "activity" | "debug";
type ActiveTab = "timeline" | "ambient" | "views" | "ocr" | "settings";
type FramePreview = { frameId: string | number; title?: string };

function App() {
  const [timeline, setTimeline] = useState<ActivityTimelineResponse | null>(null);
  const [viewFamilies, setViewFamilies] = useState<ViewFamiliesResponse | null>(null);
  const [lastTick, setLastTick] = useState<RuntimeTickResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewsLoading, setViewsLoading] = useState(false);
  const [live, setLive] = useState(true);
  const [status, setStatus] = useState("Connecting…");
  const [viewStatus, setViewStatus] = useState("Views not loaded");
  const [settingsStatus, setSettingsStatus] = useState("Settings not loaded");
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [detailMode, setDetailMode] = useState<DetailMode>("activity");
  const [activeTab, setActiveTab] = useState<ActiveTab>("timeline");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [viewInspector, setViewInspector] = useState<{ view?: ContextViewSummary; loading: boolean }>({ loading: false });
  const [previewFrame, setPreviewFrame] = useState<FramePreview | null>(null);
  const refreshSeq = useRef(0);
  const viewRefreshSeq = useRef(0);

  async function refresh(quiet = false) {
    const seq = ++refreshSeq.current;
    if (!quiet) {
      setLoading(true);
      setStatus("Loading timeline…");
    }
    try {
      const debugMode = detailMode === "debug";
      const next = await fetchActivityTimeline({
        minutes,
        limit: timelineUiRecordLimit(minutes, sourceFilter, detailMode),
        bucketMinutes: chooseBucket(minutes),
        includeLowLevelScreenpipe: debugMode,
        dedupe: !debugMode,
        bucketItemLimit: debugMode ? false : 50,
        summarizeHeartbeats: !debugMode,
        sourceFilter,
        mergeContinuous: true,
        mergeGapMinutes: 3,
      });
      if (seq !== refreshSeq.current) return;
      setTimeline(next);
      const windows = lastTick?.diagnostics?.screenpipe_activity?.count ?? 0;
      setStatus(`${next.records_used} records · ${next.buckets.length} buckets · ${windows} Screenpipe windows`);
    } catch (error) {
      if (seq !== refreshSeq.current) return;
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      if (seq === refreshSeq.current && !quiet) setLoading(false);
    }
  }

  async function refreshViews(quiet = false) {
    const seq = ++viewRefreshSeq.current;
    if (!quiet) {
      setViewsLoading(true);
      setViewStatus("Loading views…");
    }
    try {
      const next = await fetchViewFamilies();
      if (seq !== viewRefreshSeq.current) return;
      rememberViewCatalog(next.catalog);
      setViewFamilies(next);
      const aiViews = next.views.filter(view => compilerId(view).startsWith("ai.")).length;
      setViewStatus(`${next.views.length} active views · ${aiViews} AI-compressed`);
    } catch (error) {
      if (seq !== viewRefreshSeq.current) return;
      setViewStatus(error instanceof Error ? error.message : String(error));
    } finally {
      if (seq === viewRefreshSeq.current && !quiet) setViewsLoading(false);
    }
  }

  async function syncNow() {
    setLoading(true);
    setStatus("Syncing Screenpipe…");
    try {
      const tick = await syncScreenpipe(Math.min(30, Math.max(5, Math.round(minutes / 12))));
      setLastTick(tick);
      const syncedWindows = tick.diagnostics?.screenpipe_activity?.count ?? 0;
      setStatus(`${syncedWindows} Screenpipe windows synced · reloading timeline…`);
      await refresh(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh(false).catch(error => setStatus(error instanceof Error ? error.message : String(error)));
  }, [minutes, detailMode, sourceFilter]);

  useEffect(() => {
    if (activeTab !== "views") return;
    refreshViews(false).catch(error => setViewStatus(error instanceof Error ? error.message : String(error)));
  }, [activeTab]);

  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => refresh(true), POLL_MS);
    return () => window.clearInterval(timer);
  }, [live, minutes, detailMode, sourceFilter]);

  useEffect(() => {
    if (!previewFrame) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPreviewFrame(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewFrame]);

  const filteredBuckets = useMemo(() => filterBuckets(timeline?.buckets ?? [], sourceFilter, detailMode), [timeline, sourceFilter, detailMode]);
  const selectedItem = useMemo(() => findItem(filteredBuckets, selectedItemId), [filteredBuckets, selectedItemId]);
  const filteredSignals = useMemo(() => summarizeSignals(filteredBuckets), [filteredBuckets]);
  const stats = useMemo(() => summarize(filteredBuckets, lastTick), [filteredBuckets, lastTick]);

  return (
    <div className={`app-shell ${activeTab === "views" || activeTab === "ambient" ? "views-mode" : ""}`}>
      <aside className="sidebar">
        <div className="workspace-title">
          <div className="workspace-icon">I</div>
          <div>
            <b>Info</b>
            <span>Local runtime</span>
          </div>
        </div>
        <nav className="nav-list" aria-label="App navigation">
          <button className={`nav-item ${activeTab === "timeline" ? "active" : ""}`} onClick={() => setActiveTab("timeline")}><span>◷</span>Timeline</button>
          <button className={`nav-item ${activeTab === "ambient" ? "active" : ""}`} onClick={() => setActiveTab("ambient")}><span>✦</span>Ambient</button>
          <button className={`nav-item ${activeTab === "views" ? "active" : ""}`} onClick={() => setActiveTab("views")}><span>◇</span>Views</button>
          <button className={`nav-item ${activeTab === "ocr" ? "active" : ""}`} onClick={() => setActiveTab("ocr")}><span>◎</span>OCR Lab</button>
          <button className={`nav-item ${activeTab === "settings" ? "active" : ""}`} onClick={() => setActiveTab("settings")}><span>⚙</span>Settings</button>
        </nav>
        <div className="sidebar-foot">
          <div className={`live-dot ${live ? "on" : ""}`} />
          <span>{live ? "Live sync" : "Paused"}</span>
        </div>
      </aside>

      <main className="page">
        <header className="page-header">
          <div>
            <div className="breadcrumb">Info / Screenpipe</div>
            <h1>{activeTab === "timeline" ? "Timeline" : activeTab === "ambient" ? "Ambient" : activeTab === "views" ? "Runtime Views" : activeTab === "ocr" ? "OCR Lab" : "Runtime Settings"}</h1>
            <p>{activeTab === "timeline" ? "按时间整理最近 focus 的 app、网页和项目活动。" : activeTab === "ambient" ? "主动后台搜索、写作介入和小工具机会都会先沉淀成可检查的 Views。" : activeTab === "views" ? "查看 Observation 压缩和 ambient Programs 产出的 Evidence、Intent、Workflow、Advice、Task、Draft 和 Memory Views。" : activeTab === "ocr" ? "用 PP-OCRv6 tiny 在浏览器本地重跑 Screenpipe frame，先验证质量和延迟。" : "控制 VisionFrame、ActivityBlock、Intent 和 Workflow 压缩的模型与开关。"}</p>
          </div>
          <div className="header-actions">
            {activeTab === "timeline" ? (
              <>
                <select value={sourceFilter} onChange={event => setSourceFilter(event.target.value as SourceFilter)} aria-label="Timeline source">
                  <option value="all">All sources</option>
                  <option value="screenpipe">Screenpipe</option>
                  <option value="browser">Browser</option>
                  <option value="runtime">Runtime</option>
                </select>
                <select value={detailMode} onChange={event => setDetailMode(event.target.value as DetailMode)} aria-label="Timeline detail mode">
                  <option value="activity">Activity</option>
                  <option value="debug">Evidence debug</option>
                </select>
                <select value={minutes} onChange={event => setMinutes(Number(event.target.value))} aria-label="Timeline window">
                  <option value={60}>Last 1h</option>
                  <option value={180}>Last 3h</option>
                  <option value={480}>Last 8h</option>
                  <option value={1440}>Today</option>
                </select>
                <button className="secondary" onClick={() => setLive(value => !value)}>{live ? "Live" : "Paused"}</button>
                <button className="secondary" onClick={() => refresh(false)} disabled={loading}>{loading ? "Loading…" : "Reload"}</button>
                <button onClick={syncNow} disabled={loading}>{loading ? "Syncing…" : "Sync Screenpipe"}</button>
              </>
            ) : activeTab === "views" ? (
              <>
                <button className="secondary" onClick={() => setViewStatus("Create View will use the shared View catalog")}>Create View</button>
                <button onClick={() => refreshViews(false)} disabled={viewsLoading}>{viewsLoading ? "Loading…" : "Reload Views"}</button>
              </>
            ) : activeTab === "ambient" ? (
              <button onClick={() => setViewStatus("Ambient panel has local controls")}>Ambient Controls</button>
            ) : activeTab === "ocr" ? (
              <button className="secondary" onClick={() => setStatus("OCR Lab uses the current timeline frames")}>Local PP-OCRv6 Tiny</button>
            ) : (
              <button onClick={() => setSettingsStatus("Reload settings from panel")}>Runtime Controls</button>
            )}
          </div>
        </header>

        {activeTab === "timeline" ? (
          <>
            <section className="status-row">
              <Stat label="Items" value={stats.items} />
              <Stat label="Screenpipe" value={stats.screenpipe} />
              <Stat label="Last seen" value={stats.last} />
              <div className="status-text">{sourceFilterLabel(sourceFilter)} · local-first load · {status}</div>
            </section>

            <section className="context-row" aria-label="Top signals">
              <Signal label="Sources" values={filteredSignals.top_sources} />
              <Signal label="Apps" values={filteredSignals.top_apps} />
              <Signal label="Domains" values={filteredSignals.top_domains} />
            </section>

            <Timeline buckets={filteredBuckets} loading={loading && !timeline} sourceFilter={sourceFilter} selectedItemId={selectedItemId} onSelect={setSelectedItemId} onOpenFrame={setPreviewFrame} />
          </>
        ) : activeTab === "ambient" ? (
          <AmbientPanel onInspect={setViewInspector} />
        ) : activeTab === "views" ? (
          <MemoryViewsPanel response={viewFamilies} loading={viewsLoading && !viewFamilies} status={viewStatus} onInspect={setViewInspector} />
        ) : activeTab === "ocr" ? (
          <OcrLabPanel timeline={timeline} />
        ) : (
          <RuntimeSettingsPanel initialStatus={settingsStatus} onStatus={setSettingsStatus} onTick={setLastTick} />
        )}
      </main>
      {activeTab === "views" || activeTab === "ambient"
        ? <aside className="view-inspector"><ViewDetail view={viewInspector.view} loading={viewInspector.loading} /></aside>
        : activeTab === "settings"
          ? <aside className="inspector empty"><span>{settingsStatus}</span></aside>
        : activeTab === "ocr"
          ? <aside className="inspector empty"><span>PP-OCRv6 runs locally in this browser session.</span></aside>
        : <Inspector item={selectedItem} onClose={() => setSelectedItemId(null)} onOpenFrame={setPreviewFrame} />}
      <FrameLightbox preview={previewFrame} onClose={() => setPreviewFrame(null)} />
    </div>
  );
}

type OcrLabCandidate = {
  frameId: string | number;
  title: string;
  observedAt: string;
  screenpipeText?: string;
};

type OcrLabResult = {
  inputLabel: string;
  modelTier: OcrModelTier;
  text: string;
  lineCount: number;
  detectedBoxes?: number;
  recognizedCount?: number;
  predictMs?: number;
  totalMs: number;
  initMs?: number;
  runtime?: string;
  screenpipeText?: string;
  contextText?: string;
  overlap?: number;
};

type OcrModelTier = "tiny" | "small";

function OcrLabPanel({ timeline }: { timeline: ActivityTimelineResponse | null }) {
  const [labTimeline, setLabTimeline] = useState<ActivityTimelineResponse | null>(null);
  const candidates = useMemo(() => recentFrameCandidates(labTimeline ?? timeline), [labTimeline, timeline]);
  const [frameId, setFrameId] = useState("");
  const [modelTier, setModelTier] = useState<OcrModelTier>("tiny");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const uploadedFile = uploadedFiles[0] ?? null;
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [loadingFrames, setLoadingFrames] = useState(false);
  const [status, setStatus] = useState("Pick a recent frame or paste a frame_id.");
  const [result, setResult] = useState<OcrLabResult | null>(null);
  const [batchResults, setBatchResults] = useState<OcrLabResult[]>([]);

  function loadImageFiles(files: File[], source: "pasted" | "uploaded") {
    const images = files.filter(file => file.type.startsWith("image/")).slice(0, 10);
    if (!images.length) return;
    setUploadedFiles(images);
    setResult(null);
    setBatchResults([]);
    setStatus(`${source === "pasted" ? "Pasted" : "Uploaded"} ${images.length} screenshot${images.length === 1 ? "" : "s"} loaded.`);
  }

  function handlePaste(event: ClipboardEvent | React.ClipboardEvent<HTMLElement>) {
    const items = Array.from(event.clipboardData?.items ?? []);
    const images = items
      .filter(item => item.type.startsWith("image/"))
      .map(item => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (!images.length) return;
    event.preventDefault();
    loadImageFiles(images.map((image, index) => {
      const ext = image.type.split("/")[1] || "png";
      return new File([image], `pasted-screenshot-${Date.now()}-${index + 1}.${ext}`, { type: image.type || "image/png" });
    }), "pasted");
  }

  useEffect(() => {
    const listener = (event: ClipboardEvent) => handlePaste(event);
    window.addEventListener("paste", listener);
    return () => window.removeEventListener("paste", listener);
  }, []);

  useEffect(() => {
    if (!uploadedFile) {
      setUploadPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(uploadedFile);
    setUploadPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [uploadedFile]);

  useEffect(() => {
    if (!frameId && candidates[0]) setFrameId(String(candidates[0].frameId));
  }, [candidates, frameId]);

  const selectedCandidate = candidates.find(candidate => String(candidate.frameId) === frameId.trim());

  async function loadRecentFrames() {
    setLoadingFrames(true);
    setStatus("Syncing recent Screenpipe frames...");
    try {
      await syncScreenpipe(30);
      const next = await fetchActivityTimeline({
        minutes: 60,
        limit: 900,
        bucketMinutes: 10,
        includeLowLevelScreenpipe: true,
        dedupe: false,
        bucketItemLimit: false,
        summarizeHeartbeats: false,
        sourceFilter: "screenpipe",
        mergeContinuous: true,
        mergeGapMinutes: 3,
      });
      setLabTimeline(next);
      const nextCandidates = recentFrameCandidates(next);
      if (nextCandidates[0]) setFrameId(String(nextCandidates[0].frameId));
      setStatus(`${nextCandidates.length} recent Screenpipe frames loaded.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingFrames(false);
    }
  }

  async function runTinyOcr() {
    const selectedFrameId = frameId.trim();
    if (!uploadedFile && !selectedFrameId) {
      setStatus("Upload a screenshot or enter a frame_id.");
      return;
    }
    setRunning(true);
    setStatus(uploadedFile ? "Loading PP-OCRv6 tiny and uploaded screenshot..." : "Loading PP-OCRv6 tiny and Screenpipe frame...");
    try {
      const contextPromise = uploadedFile ? Promise.resolve(undefined) : fetchScreenpipeFrameContext(selectedFrameId).catch(() => undefined);
      const blobPromise = uploadedFile
        ? Promise.resolve(uploadedFile)
        : fetch(screenpipeFrameUrl(selectedFrameId), { cache: "no-store" }).then(async imageRes => {
          if (!imageRes.ok) throw new Error(`frame image fetch failed: ${imageRes.status}`);
          return imageRes.blob();
        });
      const [blob, context] = await Promise.all([blobPromise, contextPromise]);
      setStatus("Running local OCR in browser...");
      const contextText = extractFrameContextText(context);
      const screenpipeText = selectedCandidate?.screenpipeText || contextText;
      const next = await runPaddleOcrBlob(blob, {
        inputLabel: uploadedFile ? uploadedFile.name : `frame:${selectedFrameId}`,
        modelTier,
        screenpipeText: uploadedFile ? undefined : screenpipeText,
        contextText: uploadedFile ? undefined : contextText,
      });
      setResult(next);
      setStatus(`PP-OCRv6 ${modelTier} finished in ${next.totalMs}ms`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  }

  async function runBatchOcr() {
    const inputs: Array<{ label: string; blob: Blob; screenpipeText?: string } | { label: string; frameId: string | number; screenpipeText?: string }> = uploadedFiles.length
      ? uploadedFiles.slice(0, 10).map(file => ({ label: file.name, blob: file }))
      : candidates.slice(0, 10).map(candidate => ({ label: `frame:${candidate.frameId}`, frameId: candidate.frameId, screenpipeText: candidate.screenpipeText }));
    if (!inputs.length) {
      setStatus("Need pasted/uploaded screenshots or recent Screenpipe frames.");
      return;
    }
    setRunning(true);
    setBatchResults([]);
    setStatus(`Running PP-OCRv6 ${modelTier} on ${inputs.length} sample${inputs.length === 1 ? "" : "s"}...`);
    try {
      const results: OcrLabResult[] = [];
      for (const [index, input] of inputs.entries()) {
        setStatus(`Running PP-OCRv6 ${modelTier} ${index + 1}/${inputs.length}: ${input.label}`);
        const blob = "blob" in input
          ? input.blob
          : await fetch(screenpipeFrameUrl(input.frameId), { cache: "no-store" }).then(async res => {
            if (!res.ok) throw new Error(`sample fetch failed: ${res.status}`);
            return res.blob();
          });
        const next = await runPaddleOcrBlob(blob, {
          inputLabel: input.label,
          modelTier,
          screenpipeText: input.screenpipeText,
        });
        results.push(next);
        setBatchResults([...results]);
      }
      const avg = Math.round(results.reduce((sum, item) => sum + (item.predictMs ?? item.totalMs), 0) / Math.max(1, results.length));
      setStatus(`PP-OCRv6 ${modelTier} batch finished: ${results.length} samples, avg predict ${avg}ms`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="ocr-lab" aria-label="PP-OCRv6 Tiny OCR Lab" tabIndex={0} onPaste={handlePaste}>
      <section className="status-row ocr-status">
        <Stat label="Frames" value={candidates.length} />
        <Stat label="Model" value={`PP-OCRv6 ${modelTier}`} />
        <Stat label="Mode" value="browser local" />
        <div className="status-text ocr-status-text">
          <span>{status}</span>
          <button className="secondary" onClick={loadRecentFrames} disabled={loadingFrames || running}>{loadingFrames ? "Loading..." : "Load Recent Frames"}</button>
        </div>
      </section>

      <div className="ocr-layout">
        <section className="ocr-controls">
          <div className="ocr-field">
            <label htmlFor="ocr-model-tier">model</label>
            <div>
              <select id="ocr-model-tier" value={modelTier} onChange={event => setModelTier(event.target.value as OcrModelTier)} disabled={running}>
                <option value="tiny">PP-OCRv6 tiny</option>
                <option value="small">PP-OCRv6 small</option>
              </select>
              <button className="secondary" onClick={runBatchOcr} disabled={running}>{running ? "Running..." : "Run 10-sample Batch"}</button>
            </div>
          </div>
          <div className="ocr-field">
            <label htmlFor="ocr-upload">screenshot</label>
            <div>
              <input id="ocr-upload" className="ocr-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/bmp" multiple onChange={event => loadImageFiles(Array.from(event.currentTarget.files ?? []), "uploaded")} />
              {uploadedFile && <button className="secondary" onClick={() => setUploadedFiles([])} disabled={running}>Clear</button>}
            </div>
          </div>
          <div className="ocr-field">
            <label htmlFor="ocr-frame-id">frame_id</label>
            <div>
              <input id="ocr-frame-id" value={frameId} onChange={event => setFrameId(event.target.value)} placeholder="Screenpipe frame id" />
              <button onClick={runTinyOcr} disabled={running}>{running ? "Running..." : uploadedFile ? "Run Upload OCR" : "Run Frame OCR"}</button>
            </div>
          </div>
          <div className="ocr-frame-list">
            {candidates.length ? candidates.slice(0, 18).map(candidate => (
              <button key={String(candidate.frameId)} className={String(candidate.frameId) === frameId ? "selected" : ""} onClick={() => setFrameId(String(candidate.frameId))}>
                <b>{candidate.frameId}</b>
                <span>{candidate.title}</span>
                <em>{relativeTime(candidate.observedAt) || "recent"}</em>
              </button>
            )) : <div className="empty-inline">No Screenpipe frame ids in the loaded timeline. Sync Screenpipe or paste a frame_id.</div>}
          </div>
        </section>

        <section className="ocr-preview">
          {uploadPreviewUrl ? <img src={uploadPreviewUrl} alt={uploadedFile?.name ?? "Uploaded screenshot"} /> : frameId ? <img src={screenpipeFrameUrl(frameId)} alt={`Screenpipe frame ${frameId}`} /> : <div className="empty-inline">Press Cmd+V to paste a screenshot, upload an image, or select a frame.</div>}
        </section>
      </div>

      {result && (
        <section className="ocr-results">
          <div className="ocr-metrics">
            <Stat label="Total" value={`${result.totalMs}ms`} />
            <Stat label="Predict" value={result.predictMs !== undefined ? `${Math.round(result.predictMs)}ms` : "n/a"} />
            <Stat label="Lines" value={result.lineCount} />
            <Stat label="Overlap" value={result.overlap !== undefined ? `${Math.round(result.overlap * 100)}%` : "n/a"} />
          </div>
          <div className="ocr-columns">
            <section>
              <h2>PP-OCRv6 {result.modelTier}</h2>
              <pre>{result.text || "(no text recognized)"}</pre>
            </section>
            <section>
              <h2>{result.screenpipeText ? "Screenpipe current text" : "Input"}</h2>
              <pre>{result.screenpipeText || result.inputLabel}</pre>
            </section>
          </div>
          <div className="ocr-runtime">
            input: {result.inputLabel} · init: {result.initMs !== undefined ? `${result.initMs}ms` : "cached"} · runtime: {result.runtime || "unknown"} · boxes: {result.detectedBoxes ?? "n/a"} · recognized: {result.recognizedCount ?? "n/a"}
          </div>
        </section>
      )}

      {batchResults.length > 0 && (
        <section className="ocr-results">
          <div className="ocr-runtime">
            batch: {batchResults.length}/10 · model: PP-OCRv6 {modelTier} · avg predict: {Math.round(batchResults.reduce((sum, item) => sum + (item.predictMs ?? item.totalMs), 0) / Math.max(1, batchResults.length))}ms
          </div>
          <div className="ocr-batch-table">
            {batchResults.map((item, index) => (
              <article key={`${item.inputLabel}-${index}`}>
                <div>
                  <b>{index + 1}. {item.inputLabel}</b>
                  <span>{item.lineCount} lines · {item.predictMs !== undefined ? `${Math.round(item.predictMs)}ms` : `${item.totalMs}ms`} · overlap {item.overlap !== undefined ? `${Math.round(item.overlap * 100)}%` : "n/a"}</span>
                </div>
                <pre>{item.text || "(no text recognized)"}</pre>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

function AmbientPanel({ onInspect }: { onInspect: (state: { view?: ContextViewSummary; loading: boolean }) => void }) {
  const [views, setViews] = useState<ContextViewSummary[]>([]);
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ContextViewSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("Ambient views not loaded");

  const sortedViews = useMemo(() => views.filter(isSurfaceableAmbientView).sort((a, b) => Date.parse(b.updated_at ?? "") - Date.parse(a.updated_at ?? "")), [views]);
  const selectedSummary = sortedViews.find(view => view.id === selectedViewId) ?? sortedViews[0];
  const activeView = selectedDetail?.id === selectedSummary?.id ? selectedDetail : selectedSummary;
  const researchViews = sortedViews.filter(view => ["advice.research", "task.background_research", "brief.background_research"].includes(view.view_type));
  const writingViews = sortedViews.filter(view => ["advice.writing_assist", "draft.writing_continuation"].includes(view.view_type));
  const toolViews = sortedViews.filter(view => ["opportunity.tool", "task.toolsmith_prototype", "draft.tool_prototype", "tool.prototype_artifact"].includes(view.view_type));
  const languageViews = sortedViews.filter(view => ["app.language.review_queue", "memory.language.difficult_segments"].includes(view.view_type));
  const pendingTasks = sortedViews.filter(view => view.view_type.startsWith("task.") && !taskProcessedStatus(view));
  const processedTasks = sortedViews.filter(view => taskProcessedStatus(view) === "completed");

  useEffect(() => {
    void refreshAmbient();
  }, []);

  useEffect(() => {
    if (!sortedViews.length) {
      setSelectedViewId(null);
      setSelectedDetail(null);
      return;
    }
    if (!selectedViewId || !sortedViews.some(view => view.id === selectedViewId)) {
      setSelectedViewId(sortedViews[0].id);
      setSelectedDetail(null);
    }
  }, [sortedViews, selectedViewId]);

  useEffect(() => {
    if (!selectedViewId) return;
    let cancelled = false;
    setDetailLoading(true);
    fetchContextView(selectedViewId)
      .then(view => {
        if (!cancelled) setSelectedDetail(view);
      })
      .catch(() => {
        if (!cancelled) setSelectedDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedViewId]);

  useEffect(() => {
    onInspect({ view: activeView, loading: detailLoading });
  }, [activeView, detailLoading, onInspect]);

  async function refreshAmbient() {
    setLoading(true);
    setStatus("Loading ambient views...");
    try {
      const result = await fetchViewsByTypes(AMBIENT_VIEW_TYPES, { limit: 160 });
      const nextViews = result.views ?? [];
      const hidden = nextViews.filter(view => !isSurfaceableAmbientView(view)).length;
      setViews(nextViews);
      setStatus(`${nextViews.length - hidden} ambient views loaded${hidden ? ` · ${hidden} scaffold writing views hidden` : ""}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function runBackgroundTasks() {
    setRunning(true);
    setStatus("Processing ambient background tasks...");
    try {
      const tick = await runRuntimeTick({
        include_screenpipe: false,
        include_ai_sessions: false,
        include_git: false,
        compile_views: false,
        process_background_tasks: true,
        background_task_limit: 6,
        force: true,
      });
      const processed = tick.diagnostics?.background_tasks?.processed ?? 0;
      const skipped = tick.diagnostics?.background_tasks?.skipped ?? 0;
      setStatus(`Background tasks processed ${processed} · skipped ${skipped}`);
      await refreshAmbient();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  }

  async function buildToolArtifacts() {
    setRunning(true);
    setStatus("Building sandbox tool artifacts...");
    try {
      const tick = await runRuntimeTick({
        include_screenpipe: false,
        include_ai_sessions: false,
        include_git: false,
        compile_views: false,
        process_toolsmith_artifacts: true,
        toolsmith_artifact_limit: 6,
        force: true,
      });
      const processed = tick.diagnostics?.toolsmith_artifacts?.processed ?? 0;
      const skipped = tick.diagnostics?.toolsmith_artifacts?.skipped ?? 0;
      setStatus(`Tool artifacts built ${processed} · skipped ${skipped}`);
      await refreshAmbient();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  }

  async function markFeedback(view: ContextViewSummary, action: "use" | "dismiss", extra: Record<string, unknown> = {}) {
    setActionBusy(`${action}:${view.id}`);
    const type = action === "dismiss" ? "analysis.dismissed" : "analysis.useful";
    const value = action === "dismiss" ? "dismissed" : "useful";
    try {
      await submitViewFeedback({
        view_id: view.id,
        type,
        value,
        reason: action === "dismiss" ? `Dismissed ${view.view_type} from Ambient panel` : `Used ${view.view_type} from Ambient panel`,
        payload: {
          surface: "ambient.panel",
          action,
          view_type: view.view_type,
          ...extra,
        },
      });
      setStatus(`${viewFamilyLabel(view.view_type)} marked ${value}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setActionBusy(null);
    }
  }

  async function copyDraft(view: ContextViewSummary) {
    const text = draftTextOf(view);
    if (!text) {
      setStatus("No draft text available to copy");
      return;
    }
    setActionBusy(`copy:${view.id}`);
    try {
      await navigator.clipboard.writeText(text);
      await markFeedback(view, "use", { action: "copy_draft", copied_text: text.slice(0, 1200) });
      setStatus("Draft copied and feedback recorded");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setActionBusy(null);
    }
  }

  return (
    <section className="ambient-panel" aria-label="Ambient suggestions">
      <section className="status-row ambient-status">
        <Stat label="Ambient Views" value={sortedViews.length} />
        <Stat label="Pending Tasks" value={pendingTasks.length} />
        <Stat label="Completed" value={processedTasks.length} />
        <div className="status-text">{status}</div>
      </section>

      <div className="ambient-actions">
        <button className="secondary" onClick={refreshAmbient} disabled={loading || running}>{loading ? "Loading..." : "Refresh"}</button>
        <button onClick={runBackgroundTasks} disabled={running || loading}>{running ? "Processing..." : "Run Background Tasks"}</button>
        <button onClick={buildToolArtifacts} disabled={running || loading}>{running ? "Working..." : "Build Tool Artifacts"}</button>
      </div>

      <div className="ambient-grid">
        <AmbientColumn title="Research" subtitle="background search" views={researchViews} selectedId={selectedSummary?.id} actionBusy={actionBusy} onSelect={setSelectedViewId} onFeedback={markFeedback} onCopy={copyDraft} empty={loading ? "Loading research..." : "No research suggestions yet."} />
        <AmbientColumn title="Writing" subtitle="inline drafts" views={writingViews} selectedId={selectedSummary?.id} actionBusy={actionBusy} onSelect={setSelectedViewId} onFeedback={markFeedback} onCopy={copyDraft} empty={loading ? "Loading writing..." : "No writing assists yet."} />
        <AmbientColumn title="Toolsmith" subtitle="workflow tools" views={toolViews} selectedId={selectedSummary?.id} actionBusy={actionBusy} onSelect={setSelectedViewId} onFeedback={markFeedback} onCopy={copyDraft} empty={loading ? "Loading tools..." : "No tool opportunities yet."} />
        <AmbientColumn title="Language" subtitle="youtube review" views={languageViews} selectedId={selectedSummary?.id} actionBusy={actionBusy} onSelect={setSelectedViewId} onFeedback={markFeedback} onCopy={copyDraft} empty={loading ? "Loading language..." : "No review items yet."} />
      </div>
    </section>
  );
}

function AmbientColumn({ title, subtitle, views, selectedId, actionBusy, onSelect, onFeedback, onCopy, empty }: { title: string; subtitle: string; views: ContextViewSummary[]; selectedId?: string; actionBusy: string | null; onSelect: (id: string) => void; onFeedback: (view: ContextViewSummary, action: "use" | "dismiss", extra?: Record<string, unknown>) => void; onCopy: (view: ContextViewSummary) => void; empty: string }) {
  return (
    <section className="ambient-column">
      <div className="ambient-column-head">
        <div>
          <b>{title}</b>
          <span>{subtitle}</span>
        </div>
        <strong>{views.length}</strong>
      </div>
      <div className="ambient-cards">
        {views.length ? views.map(view => (
          <AmbientCard key={view.id} view={view} selected={view.id === selectedId} busy={Boolean(actionBusy?.endsWith(`:${view.id}`))} onSelect={() => onSelect(view.id)} onFeedback={onFeedback} onCopy={onCopy} />
        )) : <div className="empty-inline">{empty}</div>}
      </div>
    </section>
  );
}

function AmbientCard({ view, selected, busy, onSelect, onFeedback, onCopy }: { view: ContextViewSummary; selected: boolean; busy: boolean; onSelect: () => void; onFeedback: (view: ContextViewSummary, action: "use" | "dismiss", extra?: Record<string, unknown>) => void; onCopy: (view: ContextViewSummary) => void }) {
  const taskStatus = taskProcessedStatus(view);
  const snippets = ambientSnippets(view);
  const canCopy = Boolean(draftTextOf(view));
  const artifactUri = toolArtifactUri(view);
  return (
    <article className={`ambient-card ${selected ? "selected" : ""}`}>
      <button className="ambient-card-main" onClick={onSelect}>
        <div className="ambient-card-top">
          <span>{viewFamilyLabel(view.view_type)}</span>
          {typeof view.confidence === "number" && <b>{Math.round(view.confidence * 100)}%</b>}
        </div>
        <h3>{view.title || view.id}</h3>
        {view.summary && <p>{view.summary}</p>}
        {snippets.length > 0 && (
          <div className="ambient-snippets">
            {snippets.slice(0, 3).map(snippet => <span key={snippet}>{snippet}</span>)}
          </div>
        )}
      </button>
      <div className="ambient-card-meta">
        <span>{taskStatus ? `task ${taskStatus}` : viewTypePurpose(view.view_type)}</span>
        <span>{relativeTime(view.updated_at) || "—"}</span>
      </div>
      <div className="ambient-card-actions">
        {canCopy && <button className="secondary" onClick={() => onCopy(view)} disabled={busy}>{busy ? "..." : "Copy"}</button>}
        {artifactUri && <a className="ambient-open-link" href={artifactUri} target="_blank" rel="noreferrer" onClick={() => onFeedback(view, "use", { action: "open_artifact", artifact_uri: artifactUri })}>Open</a>}
        <button className="secondary" onClick={() => onFeedback(view, "dismiss")} disabled={busy}>{busy ? "..." : "Dismiss"}</button>
        <button onClick={() => onFeedback(view, "use")} disabled={busy}>{busy ? "..." : "Use"}</button>
      </div>
    </article>
  );
}

function isSurfaceableAmbientView(view: ContextViewSummary): boolean {
  if (!["advice.writing_assist", "draft.writing_continuation"].includes(view.view_type)) return true;
  const compiler = typeof view.compiler === "object" ? view.compiler : undefined;
  if (compiler?.id === "program.writing_ambient" && compiler.mode === "deterministic") return false;
  if (view.content?.scaffold_only === true || view.content?.generated_by === "deterministic_scaffold") return false;
  return true;
}

function RuntimeSettingsPanel({ initialStatus, onStatus, onTick }: { initialStatus: string; onStatus: (status: string) => void; onTick: (tick: RuntimeTickResponse) => void }) {
  const [settings, setSettings] = useState<RuntimeSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    void loadSettings();
  }, []);

  useEffect(() => {
    onStatus(status);
  }, [status, onStatus]);

  async function loadSettings() {
    setLoading(true);
    setStatus("Loading runtime settings…");
    try {
      const response = await fetchRuntimeSettings();
      setSettings(response.settings);
      setStatus("Runtime settings loaded");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    setStatus("Saving runtime settings…");
    try {
      const response = await saveRuntimeSettings(stripEmptySecrets(settings));
      setSettings(response.settings);
      setStatus("Runtime settings saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function runAiTick() {
    if (!settings) return;
    setRunning(true);
    setStatus("Running AI tick…");
    try {
      const tick = await runRuntimeTick({
        include_screenpipe: true,
        include_ai_sessions: false,
        include_git: false,
        force: true,
        window_minutes: 30,
        screenpipe_limit: 80,
        compile_views: true,
        ai_view_compression: !settings.ai_paused && settings.ai_view_compression !== false,
        visual_view_compression: !settings.visual_paused && settings.visual_view_compression !== false,
      });
      onTick(tick);
      const compiled = Array.isArray(tick.compiled_views) ? tick.compiled_views.length : 0;
      setStatus(`AI tick finished · ${compiled} compiler results`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  }

  function update(patch: RuntimeSettings) {
    setSettings(prev => ({ ...(prev ?? {}), ...patch }));
  }

  function updateLlm(kind: "llm" | "vision_llm", patch: RuntimeSettings["llm"]) {
    setSettings(prev => ({ ...(prev ?? {}), [kind]: { ...(prev?.[kind] ?? {}), ...(patch ?? {}) } }));
  }

  if (loading && !settings) return <div className="empty-state">Loading runtime settings…</div>;
  const value = settings ?? {};
  return (
    <section className="settings-panel" aria-label="Runtime settings">
      <section className="status-row settings-status">
        <Stat label="Vision" value={value.visual_paused ? "Paused" : value.visual_view_compression === false ? "Off" : "On"} />
        <Stat label="AI Views" value={value.ai_paused ? "Paused" : value.ai_view_compression === false ? "Off" : "On"} />
        <Stat label="Interval" value={`${value.view_compile_interval_seconds ?? 120}s`} />
        <div className="status-text">{status}</div>
      </section>

      <div className="settings-grid">
        <article className="settings-card">
          <div className="settings-card-head">
            <div>
              <span>Vision parsing</span>
              <h2>VisualFrameView</h2>
            </div>
            <label className="toggle-line">
              <input type="checkbox" checked={!value.visual_paused} onChange={event => update({ visual_paused: !event.target.checked })} />
              <span>{value.visual_paused ? "Paused" : "Active"}</span>
            </label>
          </div>
          <label className="field-line">
            <span>Enable visual compiler</span>
            <input type="checkbox" checked={value.visual_view_compression !== false} onChange={event => update({ visual_view_compression: event.target.checked })} />
          </label>
          <TextField label="Base URL" value={value.vision_llm?.base_url} onChange={next => updateLlm("vision_llm", { base_url: next })} />
          <TextField label="Model" value={value.vision_llm?.model} onChange={next => updateLlm("vision_llm", { model: next })} />
          <PasswordField label="API key" value={value.vision_llm?.api_key} onChange={next => updateLlm("vision_llm", { api_key: next })} />
          <NumberField label="Frame limit" value={value.visual_frame_limit} min={0} onChange={next => update({ visual_frame_limit: next })} />
          <NumberField label="Concurrency" value={value.visual_frame_concurrency} min={1} onChange={next => update({ visual_frame_concurrency: next })} />
          <NumberField label="Sample seconds" value={value.visual_frame_sample_seconds} min={0} onChange={next => update({ visual_frame_sample_seconds: next })} />
        </article>

        <article className="settings-card">
          <div className="settings-card-head">
            <div>
              <span>Text compression</span>
              <h2>ActivityBlock / Intent / Workflow</h2>
            </div>
            <label className="toggle-line">
              <input type="checkbox" checked={!value.ai_paused} onChange={event => update({ ai_paused: !event.target.checked })} />
              <span>{value.ai_paused ? "Paused" : "Active"}</span>
            </label>
          </div>
          <label className="field-line">
            <span>Enable AI view compression</span>
            <input type="checkbox" checked={value.ai_view_compression !== false} onChange={event => update({ ai_view_compression: event.target.checked })} />
          </label>
          <TextField label="Base URL" value={value.llm?.base_url} onChange={next => updateLlm("llm", { base_url: next })} />
          <TextField label="Model" value={value.llm?.model} onChange={next => updateLlm("llm", { model: next })} />
          <PasswordField label="API key" value={value.llm?.api_key} onChange={next => updateLlm("llm", { api_key: next })} />
          <NumberField label="Temperature" value={value.llm?.temperature} min={0} step={0.1} onChange={next => updateLlm("llm", { temperature: next })} />
          <NumberField label="Compile interval seconds" value={value.view_compile_interval_seconds} min={0} onChange={next => update({ view_compile_interval_seconds: next })} />
          <label className="field-line">
            <span>Omit max_tokens</span>
            <input type="checkbox" checked={value.llm?.omit_max_tokens !== false} onChange={event => updateLlm("llm", { omit_max_tokens: event.target.checked })} />
          </label>
        </article>
      </div>

      <div className="settings-actions">
        <button className="secondary" onClick={loadSettings} disabled={loading || saving || running}>{loading ? "Loading…" : "Reload"}</button>
        <button className="secondary" onClick={runAiTick} disabled={!settings || running || saving}>{running ? "Running…" : "Run AI tick"}</button>
        <button onClick={saveSettings} disabled={!settings || saving || running}>{saving ? "Saving…" : "Save settings"}</button>
      </div>
    </section>
  );
}

function TextField({ label, value, onChange }: { label: string; value?: string; onChange: (value: string) => void }) {
  return (
    <label className="field-line">
      <span>{label}</span>
      <input value={value ?? ""} onChange={event => onChange(event.target.value)} />
    </label>
  );
}

function PasswordField({ label, value, onChange }: { label: string; value?: string; onChange: (value: string) => void }) {
  return (
    <label className="field-line">
      <span>{label}</span>
      <input type="password" placeholder={value ? "saved" : ""} value={isRedactedSecret(value) ? "" : value ?? ""} onChange={event => onChange(event.target.value)} />
    </label>
  );
}

function NumberField({ label, value, min, step = 1, onChange }: { label: string; value?: number; min?: number; step?: number; onChange: (value: number | undefined) => void }) {
  return (
    <label className="field-line">
      <span>{label}</span>
      <input type="number" min={min} step={step} value={value ?? ""} onChange={event => onChange(event.target.value === "" ? undefined : Number(event.target.value))} />
    </label>
  );
}

function stripEmptySecrets(settings: RuntimeSettings): RuntimeSettings {
  const clean = structuredClone(settings);
  for (const key of ["llm", "vision_llm"] as const) {
    if (clean[key]?.api_key === "") delete clean[key]?.api_key;
    if (isRedactedSecret(clean[key]?.api_key)) delete clean[key]?.api_key;
  }
  return clean;
}

function isRedactedSecret(secret?: string) {
  return Boolean(secret && (secret.includes("…") || /^\*+$/.test(secret)));
}

function ViewGraph({ families }: { families: ViewFamilySummary[] }) {
  const canonical = viewTypeOrder({ families });
  const shown = families.filter(family => family.count > 0 || canonical.includes(family.family));
  return (
    <section className="view-graph" aria-label="Memory view graph">
      <div className="view-graph-head">
        <span>Memory Views</span>
        <b>Observation → EvidenceView → ActivityView → ProposalView → Resource/Intent/Workflow → MemoryView</b>
      </div>
      <div className="view-family-list">
        {shown.map(family => <ViewFamily key={family.family} family={family} />)}
      </div>
    </section>
  );
}

function rememberViewCatalog(catalog?: ViewCatalogResponse) {
  if (!catalog) return;
  VIEW_CATALOG_CACHE.clear();
  for (const family of catalog.families ?? []) VIEW_CATALOG_CACHE.set(family.view_type, family);
  VIEW_CATALOG_ORDER_CACHE = catalog.order?.length ? catalog.order : FALLBACK_VIEW_TYPE_ORDER;
}

function currentViewCatalogDefinition(type: string): ViewFamilyDefinition | undefined {
  return VIEW_CATALOG_CACHE.get(type);
}

function viewTypeOrder(input: { response?: ViewFamiliesResponse | null; families?: ViewFamilySummary[] } = {}) {
  const fromResponse = input.response?.catalog?.order;
  if (fromResponse?.length) return fromResponse;
  const fromFamilies = input.families?.map(family => family.family).filter(Boolean);
  if (fromFamilies?.length) return fromFamilies;
  return VIEW_CATALOG_ORDER_CACHE;
}

function ViewFamily({ family }: { family: ViewFamilySummary }) {
  if (family.definition) VIEW_CATALOG_CACHE.set(family.family, family.definition);
  const title = family.latest?.title ?? family.family;
  return (
    <article className={`view-family ${family.count ? "has-views" : ""}`}>
      <div>
        <span>{viewFamilyLabel(family.family)}</span>
        <b>{family.count}</b>
      </div>
      <p>{title}</p>
      <div>
        {(family.kinds.length ? family.kinds : ["waiting"]).slice(0, 4).map(kind => <Tag key={kind}>{kind}</Tag>)}
      </div>
    </article>
  );
}

function MemoryViewsPanel({ response, loading, status, onInspect }: { response: ViewFamiliesResponse | null; loading: boolean; status: string; onInspect: (state: { view?: ContextViewSummary; loading: boolean }) => void }) {
  const [selectedType, setSelectedType] = useState("intent");
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ContextViewSummary | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [typeViews, setTypeViews] = useState<Record<string, ContextViewSummary[]>>({});
  const [typeLoading, setTypeLoading] = useState(false);
  const [typeStatus, setTypeStatus] = useState("");
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const families = response?.families ?? [];
  const familyOrder = viewTypeOrder({ response, families });
  const familyByType = useMemo(() => new Map(families.map(family => [family.family, family])), [families]);
  const views = typeViews[selectedType] ?? [];
  const loadedViews = Object.values(typeViews).flat();
  const aiViews = loadedViews.filter(view => compilerId(view).startsWith("ai."));
  const tabs = useMemo(() => familyOrder.map(type => {
    const family = familyByType.get(type);
    const loaded = typeViews[type]?.length ?? 0;
    const aiCount = typeViews[type]?.filter(view => compilerId(view).startsWith("ai.")).length ?? 0;
    return { type, count: family?.count ?? 0, loaded, aiCount };
  }), [familyByType, familyOrder, typeViews]);
  const selectedViews = useMemo(() => views
    .filter(view => view.view_type === selectedType)
    .sort((a, b) => Date.parse(b.updated_at ?? "") - Date.parse(a.updated_at ?? "")), [views, selectedType]);
  const selectedSummary = selectedViews.find(view => view.id === selectedViewId) ?? selectedViews[0];
  const activeView = selectedDetail?.id === selectedSummary?.id ? selectedDetail : selectedSummary;
  const totalCount = families.reduce((sum, family) => sum + family.count, 0);

  useEffect(() => {
    if (!families.length) return;
    const currentCount = familyByType.get(selectedType)?.count ?? 0;
    if (currentCount === 0) setSelectedType(tabs.find(tab => tab.count > 0)?.type ?? "intent");
  }, [families, familyByType, selectedType, tabs]);

  useEffect(() => {
    const familyCount = familyByType.get(selectedType)?.count ?? 0;
    if (!familyCount || typeViews[selectedType]?.length) return;
    let cancelled = false;
    setTypeLoading(true);
    setTypeStatus(`Loading ${viewFamilyLabel(selectedType)}…`);
    fetchViewsByType(selectedType, { limit: viewPageSize(selectedType) })
      .then(result => {
        if (cancelled) return;
        setTypeViews(prev => ({ ...prev, [selectedType]: result.views ?? [] }));
        setTypeStatus(`${result.views?.length ?? 0}/${familyCount} ${viewFamilyLabel(selectedType)} loaded`);
      })
      .catch(error => {
        if (!cancelled) setTypeStatus(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setTypeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedType, familyByType, typeViews]);

  useEffect(() => {
    if (!selectedViews.length) {
      setSelectedViewId(null);
      setSelectedDetail(null);
      return;
    }
    if (!selectedViewId || !selectedViews.some(view => view.id === selectedViewId)) {
      setSelectedViewId(selectedViews[0].id);
      setSelectedDetail(null);
    }
  }, [selectedViews, selectedViewId]);

  useEffect(() => {
    if (!selectedViewId) return;
    let cancelled = false;
    setDetailLoading(true);
    fetchContextView(selectedViewId)
      .then(view => {
        if (!cancelled) setSelectedDetail(view);
      })
      .catch(() => {
        if (!cancelled) setSelectedDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedViewId]);

  useEffect(() => {
    onInspect({ view: activeView, loading: detailLoading });
  }, [activeView, detailLoading, onInspect]);

  useEffect(() => {
    const target = loadMoreRef.current;
    const current = typeViews[selectedType] ?? [];
    const familyCount = familyByType.get(selectedType)?.count ?? 0;
    if (!target || current.length >= familyCount) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void loadMore();
    }, { root: null, rootMargin: "900px 0px", threshold: 0.01 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [selectedType, selectedViews.length, typeLoading, familyByType, typeViews]);

  async function loadMore() {
    const current = typeViews[selectedType] ?? [];
    const familyCount = familyByType.get(selectedType)?.count ?? 0;
    if (typeLoading || current.length >= familyCount) return;
    setTypeLoading(true);
    setTypeStatus(`Loading more ${viewFamilyLabel(selectedType)}…`);
    try {
      const result = await fetchViewsByType(selectedType, { limit: viewPageSize(selectedType) + current.length });
      setTypeViews(prev => ({ ...prev, [selectedType]: result.views ?? [] }));
      setTypeStatus(`${result.views?.length ?? 0}/${familyCount} ${viewFamilyLabel(selectedType)} loaded`);
    } catch (error) {
      setTypeStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setTypeLoading(false);
    }
  }

  if (loading) return <div className="empty-state">Loading runtime view families…</div>;
  return (
    <>
      <section className="status-row views-status">
        <Stat label="Active Views" value={totalCount} />
        <Stat label="Loaded" value={loadedViews.length} />
        <Stat label="AI Loaded" value={aiViews.length} />
        <div className="status-text">{typeStatus || status}</div>
      </section>
      <section className="view-type-tabs" aria-label="View type tabs">
        {tabs.map(tab => (
          <button key={tab.type} className={tab.type === selectedType ? "active" : ""} onClick={() => {
            setSelectedType(tab.type);
            setSelectedViewId(null);
            setSelectedDetail(null);
          }}>
            <span>{viewFamilyLabel(tab.type)}</span>
            <b>{compactNumber(tab.count)}</b>
            <em>{tab.loaded > 0 ? `${tab.loaded} loaded${tab.aiCount > 0 ? ` · ${tab.aiCount} AI` : ""}` : viewTypePurpose(tab.type)}</em>
          </button>
        ))}
      </section>
      <section className="view-reader" aria-label="Selected runtime views">
        <div className="view-list-panel">
          <div className="view-list-head">
            <div>
              <b>{viewFamilyLabel(selectedType)}</b>
              <span>{selectedViews.length}/{familyByType.get(selectedType)?.count ?? 0} loaded</span>
            </div>
            <Tag>{viewTypePurpose(selectedType)}</Tag>
          </div>
          <div className="view-list-items">
            {selectedViews.length ? selectedViews.map(view => (
              <ViewListRow key={view.id} view={view} selected={view.id === selectedSummary?.id} onSelect={() => setSelectedViewId(view.id)} />
            )) : <div className="empty-inline">{typeLoading ? `Loading ${viewFamilyLabel(selectedType)}…` : `No ${viewFamilyLabel(selectedType)} yet.`}</div>}
            {selectedViews.length < (familyByType.get(selectedType)?.count ?? 0) && (
              <div className="load-more-sentinel" ref={loadMoreRef}>
                {typeLoading ? "Loading more…" : "Scroll for more"}
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

function ViewListRow({ view, selected, onSelect }: { view: ContextViewSummary; selected: boolean; onSelect: () => void }) {
  const kind = typeof view.content?.kind === "string" ? view.content.kind : view.view_type;
  const compiler = compilerId(view);
  const primaryText = view.view_type === "audio" ? audioListText(view) : view.summary;
  const audioTags = view.view_type === "audio" ? audioListTags(view) : [];
  return (
    <button className={`view-list-row ${selected ? "selected" : ""}`} onClick={onSelect}>
      <div className="view-list-row-top">
        <span>{kind}</span>
        {typeof view.confidence === "number" && <b>{Math.round(view.confidence * 100)}%</b>}
      </div>
      <h3>{view.title || view.id}</h3>
      {primaryText && <p>{primaryText}</p>}
      {audioTags.length > 0 && <div className="view-list-row-tags">{audioTags.map(tag => <Tag key={tag}>{tag}</Tag>)}</div>}
      <div className="view-list-row-meta">
        <span>{compiler || "compiler unknown"}</span>
        <span>{relativeTime(view.updated_at) || "—"}</span>
      </div>
    </button>
  );
}

function audioListText(view: ContextViewSummary): string | undefined {
  return stringContent(view, "transcript_excerpt") || view.summary;
}

function audioListTags(view: ContextViewSummary): string[] {
  const tags = [
    stringContent(view, "transcript_quality"),
    stringContent(view, "speaker_label"),
    stringContent(view, "device_name"),
    ...stringArrayContent(view, "topics").slice(0, 3),
  ];
  return [...new Set(tags.filter((tag): tag is string => Boolean(tag)))];
}

function stringContent(view: ContextViewSummary, key: string): string | undefined {
  const value = view.content?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArrayContent(view: ContextViewSummary, key: string): string[] {
  const value = view.content?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function taskProcessedStatus(view: ContextViewSummary): string | undefined {
  const task = view.content?.background_task;
  if (!task || typeof task !== "object" || Array.isArray(task)) return undefined;
  const status = (task as Record<string, unknown>).status;
  return typeof status === "string" ? status : undefined;
}

function ambientSnippets(view: ContextViewSummary): string[] {
  const out: string[] = [];
  const content = view.content ?? {};
  const keys = ["focus", "goal", "topic", "draft_text", "opportunity_kind", "output_target"];
  for (const key of keys) {
    const value = content[key];
    if (typeof value === "string" && value.trim()) out.push(value.trim());
  }
  const suggestions = content.suggestions;
  if (Array.isArray(suggestions)) {
    out.push(...suggestions.filter((item): item is string => typeof item === "string" && item.trim().length > 0));
  }
  return [...new Set(out.map(value => value.replace(/\s+/g, " ").slice(0, 180)))];
}

function toolArtifactUri(view: ContextViewSummary): string | undefined {
  const uri = view.content?.uri;
  return view.view_type === "tool.prototype_artifact" && typeof uri === "string" && uri.trim() ? uri.trim() : undefined;
}

function draftTextOf(view: ContextViewSummary): string | undefined {
  const value = view.content?.draft_text ?? view.content?.text ?? view.summary;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function ViewDetail({ view, loading }: { view?: ContextViewSummary; loading: boolean }) {
  if (!view) return <article className="view-detail empty"><span>Select a view to inspect it.</span></article>;
  const kind = typeof view.content?.kind === "string" ? view.content.kind : view.view_type;
  const compiler = compilerId(view);
  return (
    <article className="view-detail">
      <div className="view-detail-header">
        <div>
          <span>{viewFamilyLabel(view.view_type)} · {kind}</span>
          <h2>{view.title || view.id}</h2>
        </div>
        {typeof view.confidence === "number" && <b>{Math.round(view.confidence * 100)}%</b>}
      </div>
      {view.summary && <p className="view-detail-summary">{view.summary}</p>}
      <dl className="view-detail-meta">
        <dt>compiler</dt><dd>{compiler || "unknown"}</dd>
        <dt>updated</dt><dd>{view.updated_at ? new Date(view.updated_at).toLocaleString() : "—"}</dd>
        <dt>source records</dt><dd>{sourceRecordCount(view)}</dd>
        <dt>source views</dt><dd>{sourceViewCount(view)}</dd>
        <dt>status</dt><dd>{view.status ?? "active"}</dd>
        <dt>stability</dt><dd>{view.stability ?? "—"}</dd>
      </dl>
      <section className="view-detail-section">
        <h3>View ID</h3>
        <code>{view.id}</code>
      </section>
      {toolArtifactUri(view) && (
        <section className="view-detail-section">
          <h3>Artifact</h3>
          <a className="url-card" href={toolArtifactUri(view)} target="_blank" rel="noreferrer">{toolArtifactUri(view)}</a>
        </section>
      )}
      <section className="view-detail-section">
        <h3>Content</h3>
        {loading ? <div className="empty-inline">Loading full view…</div> : <pre>{JSON.stringify(view.content ?? {}, null, 2)}</pre>}
      </section>
    </article>
  );
}

function Timeline({ buckets, loading, sourceFilter, selectedItemId, onSelect, onOpenFrame }: { buckets: TimelineBucket[]; loading: boolean; sourceFilter: SourceFilter; selectedItemId: string | null; onSelect: (id: string) => void; onOpenFrame: (preview: FramePreview) => void }) {
  if (loading) return <div className="empty-state">Loading timeline…</div>;
  if (!buckets.length) return <div className="empty-state">No {sourceFilterLabel(sourceFilter).toLowerCase()} items in this time window. Click Sync or widen the time range.</div>;
  return (
    <section className="timeline-list" aria-label="Activity timeline">
      {buckets.map(bucket => <Bucket key={bucket.label} bucket={bucket} selectedItemId={selectedItemId} onSelect={onSelect} onOpenFrame={onOpenFrame} />)}
    </section>
  );
}

function Bucket({ bucket, selectedItemId, onSelect, onOpenFrame }: { bucket: TimelineBucket; selectedItemId: string | null; onSelect: (id: string) => void; onOpenFrame: (preview: FramePreview) => void }) {
  return (
    <section className="bucket">
      <div className="bucket-heading">
        <time>{formatRange(bucket.start, bucket.end)}</time>
        <span>{bucket.count} items</span>
      </div>
      <div className="bucket-items">
        {bucket.items.map(item => <TimelineRow key={item.id} item={item} selected={item.id === selectedItemId} onSelect={() => onSelect(item.id)} onOpenFrame={onOpenFrame} />)}
      </div>
    </section>
  );
}

function TimelineRow({ item, selected, onSelect, onOpenFrame }: { item: TimelineItem; selected: boolean; onSelect: () => void; onOpenFrame: (preview: FramePreview) => void }) {
  const frameIds = frameIdsOf(item).slice(0, 3);
  return (
    <article className={`timeline-row ${selected ? "selected" : ""}`} onClick={onSelect}>
      <div className={`row-icon ${sourceClass(item)}`}>{iconFor(item)}</div>
      <div className="row-content">
        <div className="row-title">
          <b>{item.title}</b>
          <time>{timeOfDay(item.observed_at)}</time>
        </div>
        <div className="row-subtitle">{item.subtitle || sourceLabel(item)}</div>
        <AttributionStrip item={item} />
        {item.text && <div className="row-text">{item.text}</div>}
        {frameIds.length > 0 && (
          <div className="row-frames" aria-label="Screenpipe OCR screenshots">
            {frameIds.map(frameId => (
              <FrameThumb key={String(frameId)} frameId={frameId} title={item.title} onOpenFrame={onOpenFrame} />
            ))}
          </div>
        )}
        <div className="row-meta">
          <Tag>{item.source}</Tag>
          {item.schema && <Tag>{item.schema}</Tag>}
          {item.app && <Tag>{item.app}</Tag>}
          {item.domain && <Tag>{item.domain}</Tag>}
          {item.project && <Tag>{item.project}</Tag>}
          {item.stats?.dwell_seconds !== undefined && <Tag>{Math.round(Number(item.stats.dwell_seconds))}s dwell</Tag>}
          {detailTags(item).map(tag => <Tag key={tag}>{tag}</Tag>)}
        </div>
        {(item.url || item.path || detailCode(item)) && <code>{item.url || item.path || detailCode(item)}</code>}
      </div>
    </article>
  );
}

function Inspector({ item, onClose, onOpenFrame }: { item?: TimelineItem; onClose: () => void; onOpenFrame: (preview: FramePreview) => void }) {
  if (!item) {
    return <aside className="inspector empty"><span>Select a timeline item</span></aside>;
  }
  const frameIds = frameIdsOf(item);
  const webUrl = item.url || stringStat(item, "browser_url");
  return (
    <aside className="inspector">
      <div className="inspector-header">
        <div>
          <span>Evidence</span>
          <h2>{item.title}</h2>
        </div>
        <button onClick={onClose} aria-label="Close inspector">×</button>
      </div>

      {frameIds.length > 0 && (
        <section className="inspector-section">
          <h3>Screenshots</h3>
          <div className="frame-grid">
            {frameIds.slice(0, 8).map(frameId => (
              <figure key={String(frameId)} className="frame-card">
                <FrameThumb frameId={frameId} title={item.title} onOpenFrame={onOpenFrame} large />
                <figcaption>frame_id: {frameId}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {webUrl && (
        <section className="inspector-section">
          <h3>Web</h3>
          <a className="url-card" href={webUrl} target="_blank" rel="noreferrer">{webUrl}</a>
        </section>
      )}

      {item.text && (
        <section className="inspector-section">
          <h3>Text</h3>
          <pre>{item.text}</pre>
        </section>
      )}

      <section className="inspector-section">
        <h3>Attribution</h3>
        <dl>
          {attributionEntries(item).map(([label, value]) => (
            <React.Fragment key={label}>
              <dt>{label}</dt><dd>{value}</dd>
            </React.Fragment>
          ))}
        </dl>
      </section>

      <section className="inspector-section">
        <h3>Metadata</h3>
        <dl>
          <dt>source</dt><dd>{item.source}</dd>
          {item.schema && <><dt>schema</dt><dd>{item.schema}</dd></>}
          <dt>time</dt><dd>{new Date(item.observed_at).toLocaleString()}</dd>
          {item.app && <><dt>app</dt><dd>{item.app}</dd></>}
          {item.domain && <><dt>domain</dt><dd>{item.domain}</dd></>}
        </dl>
        <pre>{JSON.stringify(item.stats ?? {}, null, 2)}</pre>
      </section>
    </aside>
  );
}

function FrameThumb({ frameId, title, onOpenFrame, large = false }: { frameId: string | number; title?: string; onOpenFrame: (preview: FramePreview) => void; large?: boolean }) {
  return (
    <button
      className={large ? "frame-button large" : "frame-button"}
      type="button"
      onClick={event => {
        event.stopPropagation();
        onOpenFrame({ frameId, title });
      }}
      aria-label={`Open Screenpipe frame ${frameId}`}
    >
      <img className={large ? "frame-image" : undefined} src={screenpipeFrameUrl(frameId)} alt={`Screenpipe frame ${frameId}`} loading="lazy" />
    </button>
  );
}

function FrameLightbox({ preview, onClose }: { preview: FramePreview | null; onClose: () => void }) {
  if (!preview) return null;
  return (
    <div className="frame-lightbox" role="dialog" aria-modal="true" aria-label={`Screenpipe frame ${preview.frameId}`} onClick={onClose}>
      <div className="frame-lightbox-panel" onClick={event => event.stopPropagation()}>
        <div className="frame-lightbox-header">
          <div>
            <b>{preview.title ?? "Screenpipe frame"}</b>
            <span>frame_id: {preview.frameId}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close frame preview">×</button>
        </div>
        <img src={screenpipeFrameUrl(preview.frameId)} alt={`Screenpipe frame ${preview.frameId}`} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="stat"><span>{label}</span><b>{value}</b></div>;
}

function Signal({ label, values }: { label: string; values?: string[] }) {
  const shown = values?.filter(Boolean).slice(0, 5) ?? [];
  return <div className="signal"><span>{label}</span><div>{shown.length ? shown.map(value => <Tag key={value}>{value}</Tag>) : <em>—</em>}</div></div>;
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="tag">{children}</span>;
}

function AttributionStrip({ item }: { item: TimelineItem }) {
  const entries = attributionEntries(item);
  if (!entries.length) return null;
  return (
    <div className="attribution-strip" aria-label="Attribution signals">
      {entries.map(([label, value]) => <span key={label}><b>{label}</b>{value}</span>)}
    </div>
  );
}

function summarize(buckets: TimelineBucket[], tick: RuntimeTickResponse | null) {
  const items = buckets.reduce((sum, bucket) => sum + bucket.items.length, 0);
  const screenpipe = tick?.diagnostics?.screenpipe_activity?.count ?? countScreenpipe(buckets);
  const latest = buckets.flatMap(bucket => bucket.items).sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at))[0]?.observed_at;
  return { items, screenpipe, last: relativeTime(latest) || "—" };
}

function countScreenpipe(buckets: TimelineBucket[]) {
  return buckets.flatMap(bucket => bucket.items).filter(item => item.source.toLowerCase().includes("screenpipe") || item.schema?.includes("screenpipe")).length;
}

function findItem(buckets: TimelineBucket[], id: string | null) {
  if (!id) return undefined;
  return buckets.flatMap(bucket => bucket.items).find(item => item.id === id);
}

function filterBuckets(buckets: TimelineBucket[], filter: SourceFilter, detailMode: DetailMode): TimelineBucket[] {
  void detailMode;
  return buckets.map(bucket => {
    const items = bucket.items.filter(item => sourceMatches(item, filter));
    return {
      ...bucket,
      count: items.length,
      items,
      top_sources: top(items.map(item => item.source), 5),
      top_apps: top(items.map(item => item.app).filter(Boolean) as string[], 5),
      top_domains: top(items.map(item => item.domain).filter(Boolean) as string[], 5),
      top_projects: top(items.map(item => item.project).filter(Boolean) as string[], 5),
    };
  }).filter(bucket => bucket.items.length > 0);
}

function sourceMatches(item: TimelineItem, filter: SourceFilter) {
  if (filter === "all") return true;
  const hay = `${item.source} ${item.schema ?? ""} ${item.kind} ${item.event_type ?? ""}`.toLowerCase();
  return hay.includes(filter);
}

function sourceFilterLabel(filter: SourceFilter) {
  if (filter === "screenpipe") return "Screenpipe";
  if (filter === "browser") return "Browser";
  if (filter === "runtime") return "Runtime";
  return "All sources";
}

function viewFamilyLabel(family: string) {
  const definition = currentViewCatalogDefinition(family);
  if (definition?.label) return definition.label;
  const labels: Record<string, string> = {
    evidence: "EvidenceView",
    visual_frame: "VisualFrameView",
    audio: "AudioView",
    activity: "ActivityView",
    activity_block: "ActivityBlockView",
    proposal: "ProposalView",
    intent: "IntentView",
    workflow: "WorkflowView",
    memory: "MemoryView",
    resource: "ResourceView",
    "thread.active_work": "Active Work",
    "project.current_context": "Project Context",
    "brief.research": "Research Brief",
    "brief.background_research": "Background Research",
    "advice.research": "Research Advice",
    "advice.writing_assist": "Writing Assist",
    "task.background_research": "Research Task",
    "draft.writing_continuation": "Writing Draft",
    "opportunity.tool": "Tool Opportunity",
    "task.toolsmith_prototype": "Toolsmith Task",
    "draft.tool_prototype": "Tool Prototype",
    "tool.prototype_artifact": "Tool Artifact",
    answer: "AnswerView",
  };
  return labels[family] ?? family;
}

function compactNumber(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(value);
}

function viewPageSize(type: string) {
  return currentViewCatalogDefinition(type)?.default_page_size ?? (type === "evidence" || type === "activity" ? 120 : type === "visual_frame" || type === "proposal" ? 80 : type.startsWith("advice.") || type.startsWith("task.") || type.startsWith("draft.") || type.startsWith("opportunity.") ? 80 : 60);
}

function viewTypePurpose(type: string) {
  const definition = currentViewCatalogDefinition(type);
  if (definition?.purpose) return definition.purpose;
  const labels: Record<string, string> = {
    evidence: "raw evidence",
    visual_frame: "screen semantics",
    audio: "speech semantics",
    activity: "time chunk",
    activity_block: "10m block",
    proposal: "next view",
    resource: "material",
    intent: "goal signal",
    workflow: "work session",
    memory: "agent memory",
    "thread.active_work": "current focus",
    "project.current_context": "project state",
    "brief.research": "research synthesis",
    "brief.background_research": "background search",
    "advice.research": "surface suggestion",
    "advice.writing_assist": "inline help",
    "task.background_research": "delegated search",
    "draft.writing_continuation": "editable text",
    "opportunity.tool": "workflow improvement",
    "task.toolsmith_prototype": "tool design task",
    "draft.tool_prototype": "prototype plan",
    "tool.prototype_artifact": "sandbox artifact",
  };
  return labels[type] ?? "view";
}

function compilerId(view: { compiler?: { id?: string } | string }) {
  if (typeof view.compiler === "string") return view.compiler;
  return view.compiler?.id ?? "";
}

function sourceRecordCount(view: ContextViewSummary) {
  return view.source_record_count ?? view.source_records?.length ?? 0;
}

function sourceViewCount(view: ContextViewSummary) {
  return view.source_view_count ?? view.source_views?.length ?? 0;
}

function groupViews(views: ViewFamiliesResponse["views"]) {
  const order = FALLBACK_VIEW_TYPE_ORDER;
  const byType = new Map<string, ViewFamiliesResponse["views"]>();
  for (const view of views) {
    const group = byType.get(view.view_type) ?? [];
    group.push(view);
    byType.set(view.view_type, group);
  }
  return [...byType.entries()]
    .sort((a, b) => {
      const ai = order.indexOf(a[0]);
      const bi = order.indexOf(b[0]);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a[0].localeCompare(b[0]);
    })
    .map(([type, groupedViews]) => ({ type, views: groupedViews.slice(0, 24) }));
}

function summarizeSignals(buckets: TimelineBucket[]) {
  const items = buckets.flatMap(bucket => bucket.items);
  return {
    top_sources: top(items.map(item => item.source), 10),
    top_apps: top(items.map(item => item.app).filter(Boolean) as string[], 10),
    top_domains: top(items.map(item => item.domain).filter(Boolean) as string[], 10),
  };
}

function chooseBucket(minutes: number) {
  if (minutes <= 90) return 5;
  if (minutes <= 240) return 10;
  if (minutes <= 720) return 20;
  return 30;
}

function timelineUiRecordLimit(minutes: number, sourceFilter: SourceFilter, detailMode: DetailMode) {
  if (detailMode === "debug") {
    const samplesPerMinute = sourceFilter === "runtime" ? 2 : sourceFilter === "browser" ? 8 : sourceFilter === "screenpipe" ? 10 : 12;
    return Math.min(3_000, Math.max(500, Math.ceil(minutes * samplesPerMinute)));
  }
  const samplesPerMinute = sourceFilter === "runtime" ? 1 : sourceFilter === "browser" ? 3 : sourceFilter === "screenpipe" ? 4 : 5;
  return Math.min(1_200, Math.max(240, Math.ceil(minutes * samplesPerMinute)));
}

function iconFor(item: TimelineItem) {
  const hay = `${item.source} ${item.schema ?? ""} ${item.kind}`.toLowerCase();
  if (hay.includes("screenpipe")) return "◉";
  if (hay.includes("browser")) return "↗";
  if (hay.includes("runtime")) return "◆";
  if (hay.includes("local") || hay.includes("git")) return "⌘";
  if (hay.includes("ai") || hay.includes("claude") || hay.includes("codex")) return "AI";
  return "•";
}

function sourceClass(item: TimelineItem) {
  const hay = `${item.source} ${item.schema ?? ""} ${item.kind}`.toLowerCase();
  if (hay.includes("screenpipe")) return "screenpipe";
  if (hay.includes("browser")) return "browser";
  if (hay.includes("runtime")) return "runtime";
  return "other";
}

function sourceLabel(item: TimelineItem) {
  return [item.schema, item.event_type, item.app, item.domain].filter(Boolean).join(" · ");
}

function detailTags(item: TimelineItem) {
  const stats = item.stats ?? {};
  const pairs: string[] = [];
  if (typeof stats.duration_minutes === "number" && Number.isFinite(stats.duration_minutes)) pairs.push(`duration: ${formatDuration(Number(stats.duration_minutes))}`);
  for (const key of ["content_type", "role", "frame_id", "minutes", "frame_count", "node_count", "text_source", "capture_trigger", "attribution_source"] as const) {
    if (stats[key] !== undefined && stats[key] !== "") pairs.push(`${key}: ${stats[key]}`);
  }
  return pairs.slice(0, 8);
}

function formatDuration(minutes: number) {
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function attributionEntries(item: TimelineItem): Array<[string, string]> {
  const stats = item.stats ?? {};
  const entries: Array<[string, unknown]> = [
    ["interaction", stats.interaction_app],
    ["interaction event", stats.interaction_event],
    ["reported app", stats.reported_app ?? stats.app_name ?? item.app],
    ["visible", stats.visible_label],
    ["visual domain", stats.visual_domain ?? item.domain],
    ["window", stats.window_title ?? stats.window_name],
    ["reported url", stats.reported_url ?? stats.browser_url ?? item.url],
    ["source", stats.attribution_source],
  ];
  const seen = new Set<string>();
  return entries
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
    .filter(([label, value]) => {
      const key = `${label}:${value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function detailCode(item: TimelineItem) {
  const stats = item.stats ?? {};
  return String(stats.browser_url ?? stats.project_path ?? stats.repo ?? stats.window_name ?? "");
}

function frameIdOf(item: TimelineItem): string | number | undefined {
  const value = item.stats?.frame_id;
  if (typeof value === "string" || typeof value === "number") return value;
  return undefined;
}

function frameIdsOf(item: TimelineItem): Array<string | number> {
  const values: Array<string | number> = [];
  const raw = item.stats?.frame_ids;
  if (Array.isArray(raw)) {
    for (const value of raw) {
      if (typeof value === "string" || typeof value === "number") values.push(value);
    }
  }
  const single = frameIdOf(item);
  if (single !== undefined) values.push(single);
  const seen = new Set<string>();
  return values.filter(value => {
    const key = String(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stringStat(item: TimelineItem, key: string): string | undefined {
  const value = item.stats?.[key];
  return typeof value === "string" && value ? value : undefined;
}

const paddleOcrPromises = new Map<OcrModelTier, Promise<{ ocr: any; initMs?: number }>>();

async function getPaddleOcr(tier: OcrModelTier): Promise<{ ocr: any; initMs?: number }> {
  const cached = paddleOcrPromises.get(tier);
  if (cached) return cached;
  const promise = (async () => {
      const startedAt = performance.now();
      const { PaddleOCR } = await import("@paddleocr/paddleocr-js");
      const ocr = await PaddleOCR.create({
        textDetectionModelName: `PP-OCRv6_${tier}_det`,
        textRecognitionModelName: `PP-OCRv6_${tier}_rec`,
        worker: false,
        ortOptions: {
          backend: "wasm",
          numThreads: 1,
          simd: true,
        },
      });
      return { ocr, initMs: Math.round(performance.now() - startedAt) };
  })();
  paddleOcrPromises.set(tier, promise);
  return promise;
}

async function runPaddleOcrBlob(blob: Blob, options: { inputLabel: string; modelTier: OcrModelTier; screenpipeText?: string; contextText?: string }): Promise<OcrLabResult> {
  const startedAt = performance.now();
  const { ocr, initMs } = await getPaddleOcr(options.modelTier);
  const [ocrResult] = await ocr.predict(blob, {
    textDetLimitSideLen: 960,
    textDetLimitType: "max",
  });
  const items = Array.isArray(ocrResult?.items) ? ocrResult.items : [];
  const text = items.map((item: any) => item?.text).filter((value: unknown) => typeof value === "string" && value.trim()).join("\n");
  return {
    inputLabel: options.inputLabel,
    modelTier: options.modelTier,
    text,
    lineCount: items.length,
    detectedBoxes: numberValue(ocrResult?.metrics?.detectedBoxes),
    recognizedCount: numberValue(ocrResult?.metrics?.recognizedCount),
    predictMs: numberValue(ocrResult?.metrics?.totalMs),
    totalMs: Math.round(performance.now() - startedAt),
    initMs,
    runtime: [ocrResult?.runtime?.requestedBackend, ocrResult?.runtime?.detProvider, ocrResult?.runtime?.recProvider].filter(Boolean).join(" / "),
    screenpipeText: options.screenpipeText,
    contextText: options.contextText,
    overlap: text && options.screenpipeText ? textOverlap(text, options.screenpipeText) : undefined,
  };
}

function recentFrameCandidates(timeline: ActivityTimelineResponse | null): OcrLabCandidate[] {
  const candidates: OcrLabCandidate[] = [];
  const seen = new Set<string>();
  for (const bucket of timeline?.buckets ?? []) {
    for (const item of bucket.items) {
      for (const frameId of frameIdsOf(item)) {
        const key = String(frameId);
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({
          frameId,
          title: item.title || sourceLabel(item) || "Screenpipe frame",
          observedAt: item.observed_at,
          screenpipeText: item.text,
        });
      }
    }
  }
  return candidates.sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt)).slice(0, 40);
}

function extractFrameContextText(response: unknown): string | undefined {
  const body = response && typeof response === "object" ? response as any : undefined;
  const context = body?.context;
  const recordText = body?.record?.content?.text;
  const direct = typeof context?.text === "string" ? context.text : undefined;
  if (direct?.trim()) return direct.trim();
  if (typeof recordText === "string" && recordText.trim()) return recordText.trim();
  const nodes = Array.isArray(context?.nodes) ? context.nodes : [];
  const nodeText = nodes
    .map((node: any) => node?.text ?? node?.label ?? node?.name ?? node?.value)
    .filter((value: unknown) => typeof value === "string" && value.trim())
    .slice(0, 120)
    .join("\n");
  return nodeText.trim() || undefined;
}

function textOverlap(a: string, b: string): number {
  const left = charCounts(normalizeCompareText(a));
  const right = charCounts(normalizeCompareText(b));
  let hit = 0;
  let total = 0;
  for (const [char, count] of left) {
    total += count;
    hit += Math.min(count, right.get(char) ?? 0);
  }
  return total > 0 ? hit / total : 0;
}

function normalizeCompareText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "");
}

function charCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const char of text) counts.set(char, (counts.get(char) ?? 0) + 1);
  return counts;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatRange(start: string, end: string) {
  return `${timeOfDay(start)} – ${timeOfDay(end)}`;
}

function timeOfDay(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function relativeTime(iso?: string) {
  if (!iso) return "";
  const delta = Date.now() - Date.parse(iso);
  if (!Number.isFinite(delta)) return "";
  const seconds = Math.max(1, Math.round(delta / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function top(values: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value]) => value).slice(0, limit);
}

createRoot(document.getElementById("root")!).render(<App />);
