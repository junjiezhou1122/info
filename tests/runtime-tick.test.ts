import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ContextStore } from "../src/core/store.js";
import { runtimeTick } from "../src/runtime/runtime.js";
import { compileWorkThreadView } from "../src/runtime/work-thread-view.js";
import { compileActivityTimeline } from "../src/runtime/activity-timeline.js";

function withStore(fn: (store: ContextStore) => Promise<void> | void) {
  const dir = mkdtempSync(join(tmpdir(), "info-runtime-tick-test-"));
  const store = new ContextStore(join(dir, "context.sqlite"));
  return Promise.resolve(fn(store)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

test("runtimeTick writes WorkThread state and Views without episode candidate Records", async () => withStore(async (store) => {
  store.insertRecord({
    id: "record:runtime-tick-local-project",
    schema: { name: "observation.local_project", version: 1 },
    source: { type: "local_project", connector: "runtime-snapshot" },
    scope: { project: "info", project_path: "/Users/junjie/info", app: "terminal" },
    content: {
      title: "Local project snapshot: info",
      path: "/Users/junjie/info",
      text: "TypeScript project. Runtime tick should maintain work thread candidates as views.",
    },
    payload: { root: "/Users/junjie/info", files_touched: ["src/runtime/runtime.ts"] },
    privacy: { level: "private", retention: "normal", allow_external_llm: false },
  });
  store.insertRecord({
    id: "record:runtime-tick-browser",
    schema: { name: "observation.browser_page_snapshot", version: 1 },
    source: { type: "browser", connector: "chrome-extension" },
    scope: { project: "info", project_path: "/Users/junjie/info", domain: "github.com", app: "chrome" },
    content: {
      title: "info runtime docs",
      url: "https://github.com/example/info",
      text: "Context runtime docs mention work_thread views and candidate thread routing.",
    },
    privacy: { level: "private", retention: "normal", allow_external_llm: false },
  });

  const result = await runtimeTick({
    include_screenpipe: false,
    include_ai_sessions: false,
    include_git: false,
    compile_views: true,
    force: true,
    window_minutes: 60,
    min_score: 0.2,
  }, store);

  assert.equal(result.ok, true);
  assert.ok(result.candidate_threads.length >= 1);
  assert.ok(result.written_threads.length >= 1);
  assert.equal(result.evidence.written_records.some(id => id.startsWith("runtime:")), false);
  assert.equal(store.recent(20).filter(record => record.schema.name === "episode.candidate_thread").length, 0);
  assert.ok(store.listViews({ view_types: ["work_thread"], limit: 5 })[0]);
  assert.equal(store.getRuntimeState("active_thread")?.value?.thread_id, result.written_threads[0]);
}));

test("runtimeTick persists Screenpipe observations so activity timeline can display them", async () => withStore(async (store) => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.SCREENPIPE_API_KEY;
  process.env.SCREENPIPE_API_KEY = "test-screenpipe-key";
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    if (url.pathname === "/activity-summary") {
      return Response.json({
        time_range: { end: new Date().toISOString() },
        windows: [{
          app_name: "Warp",
          window_name: "info",
          browser_url: "",
          minutes: 3.5,
          frame_count: 4,
        }],
      });
    }
    if (url.pathname === "/elements") return Response.json([]);
    if (url.pathname === "/search") {
      if (url.searchParams.get("content_type") === "input") return Response.json([]);
      if (url.searchParams.get("content_type") === "audio") {
        return Response.json({
          data: [{
            type: "Audio",
            content: {
              chunk_id: 14901,
              timestamp: new Date().toISOString(),
              transcription: "讨论 audio view 应该完整展示",
              device_name: "EarPods Microphone",
            },
          }],
        });
      }
      return Response.json({
        data: [{
          type: "ocr",
          content: {
            frame_id: 9466,
            timestamp: new Date().toISOString(),
            app_name: "Warp",
            window_name: "info",
            text: "/Users/junjie/info pnpm build",
          },
        }],
      });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  try {
    const result = await runtimeTick({
      include_screenpipe: true,
      include_ai_sessions: false,
      include_git: false,
      compile_views: false,
      force: true,
      window_minutes: 15,
    }, store);
    const persisted = store.recent(20).filter(record => record.source.type === "screenpipe");
    const timeline = compileActivityTimeline({ minutes: 60, write: false }, store);

    assert.equal(result.ok, true);
    assert.equal(result.evidence.screenpipe_records, 3);
    assert.deepEqual(new Set(result.evidence.written_records), new Set(persisted.map(record => record.id)));
    assert.ok(persisted.some(record => record.schema.name === "observation.screenpipe_activity_summary"));
    assert.ok(persisted.some(record => record.schema.name === "observation.screenpipe_activity"));
    assert.ok(persisted.some(record => record.schema.name === "observation.screenpipe_audio"));
    assert.ok(timeline.buckets.flatMap(bucket => bucket.items).some(item => item.source.startsWith("screenpipe/")));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.SCREENPIPE_API_KEY;
    else process.env.SCREENPIPE_API_KEY = originalApiKey;
  }
}));

test("WorkThread and timeline suppress passive Warp focus and low-value Terminal OCR", () => withStore((store) => {
  store.insertRecord({
    id: "record:noise-local-project",
    schema: { name: "observation.local_project", version: 1 },
    source: { type: "local_project", connector: "runtime-snapshot" },
    scope: { project: "info", project_path: "/Users/junjie/info", app: "terminal" },
    content: {
      title: "Local project snapshot: info",
      path: "/Users/junjie/info",
      text: "Working on VisualFrameView ActivityBlockView WorkflowView MemoryView quality.",
    },
    payload: { root: "/Users/junjie/info", cwd: "/Users/junjie/info" },
    privacy: { level: "private", retention: "normal" },
  });
  store.insertRecord({
    id: "record:noise-warp-focus",
    schema: { name: "observation.screenpipe_activity_summary", version: 1 },
    source: { type: "screenpipe", connector: "screenpipe-activity-summary" },
    scope: { app: "Warp" },
    content: { title: "Warp - ⠋ info", text: "" },
    payload: { app_name: "Warp", window_name: "⠋ info", browser_url: "", minutes: 6, frame_count: 40 },
    privacy: { level: "private", retention: "normal" },
  });
  store.insertRecord({
    id: "record:noise-terminal-ocr",
    schema: { name: "observation.screenpipe_activity", version: 1 },
    source: { type: "screenpipe", connector: "screenpipe-local-api" },
    scope: { app: "Terminal" },
    content: { title: "Terminal - OCR", text: "random terminal prompt with no useful work signal" },
    payload: { app_name: "Terminal", window_name: "Terminal - OCR", content_type: "OCR" },
    privacy: { level: "private", retention: "normal" },
  });

  const workThread = compileWorkThreadView({ minutes: 60, write: false, min_score: 0.1 }, store);
  const timeline = compileActivityTimeline({ minutes: 60, write: false }, store);
  const debugTimeline = compileActivityTimeline({ minutes: 60, write: false, includeLowLevelScreenpipe: true }, store);

  assert.deepEqual(workThread.view.source_records, ["record:noise-local-project"]);
  assert.doesNotMatch(JSON.stringify(workThread.view.content), /record:noise-warp-focus|record:noise-terminal-ocr/);
  assert.equal(timeline.buckets.flatMap(bucket => bucket.items).some(item => item.record_ids?.includes("record:noise-warp-focus")), false);
  assert.equal(timeline.buckets.flatMap(bucket => bucket.items).some(item => item.record_ids?.includes("record:noise-terminal-ocr")), false);
  assert.ok(debugTimeline.buckets.flatMap(bucket => bucket.items).some(item => item.record_ids?.includes("record:noise-terminal-ocr")));
}));


test("WorkThread View compiler ignores legacy derived and episode Records as evidence", async () => withStore(async (store) => {
  store.insertRecord({
    id: "record:work-thread-raw-source",
    schema: { name: "observation.browser_page_snapshot", version: 1 },
    source: { type: "browser", connector: "chrome-extension" },
    content: {
      title: "Raw Info project page",
      url: "https://github.com/example/info",
      text: "Raw observation about context runtime work_thread views and plugin routing.",
    },
    privacy: { level: "private", retention: "normal", allow_external_llm: false },
  });
  store.insertRecord({
    id: "record:work-thread-derived-legacy",
    schema: { name: "derived.project_memory", version: 1 },
    source: { type: "plugin", connector: "legacy-compiler" },
    content: {
      title: "Legacy derived memory",
      text: "LEGACY DERIVED RECORD SHOULD NOT BECOME WORK_THREAD EVIDENCE even if it mentions github.com pnpm runtime context.",
    },
    privacy: { level: "private", retention: "normal", allow_external_llm: false },
  });
  store.insertRecord({
    id: "record:work-thread-episode-legacy",
    schema: { name: "episode.project_work", version: 1 },
    source: { type: "plugin", connector: "legacy-episode" },
    content: {
      title: "Legacy project episode",
      text: "LEGACY EPISODE RECORD SHOULD NOT BECOME WORK_THREAD EVIDENCE even if it mentions github.com pnpm runtime context.",
    },
    privacy: { level: "private", retention: "normal", allow_external_llm: false },
  });

  const result = await runtimeTick({
    include_screenpipe: false,
    include_ai_sessions: false,
    include_git: false,
    compile_views: true,
    force: true,
    window_minutes: 60,
    min_score: 0.1,
  }, store);
  const view = store.listViews({ view_types: ["work_thread"], limit: 1 })[0];

  assert.equal(result.ok, true);
  assert.ok(view);
  assert.deepEqual(view.source_records, ["record:work-thread-raw-source"]);
  assert.doesNotMatch(JSON.stringify(view.content), /LEGACY DERIVED RECORD SHOULD NOT BECOME/);
  assert.doesNotMatch(JSON.stringify(view.content), /LEGACY EPISODE RECORD SHOULD NOT BECOME/);
}));

test("WorkThread View compiler ignores newer legacy Records before limiting", async () => withStore(async (store) => {
  store.insertRecord({
    id: "record:work-thread-legacy-starvation-visible",
    schema: { name: "observation.browser_page_snapshot", version: 1 },
    source: { type: "browser", connector: "chrome-extension" },
    content: {
      title: "Visible Info project page after legacy filtering",
      url: "https://github.com/example/info",
      text: "Raw observation about context runtime work_thread views and plugin routing.",
    },
    privacy: { level: "private", retention: "normal", allow_external_llm: false },
  });
  await new Promise(resolve => setTimeout(resolve, 2));
  for (let index = 0; index < 3; index++) {
    store.insertRecord({
      id: `record:work-thread-legacy-starvation-newer-${index}`,
      schema: { name: "derived.project_memory", version: 1 },
      source: { type: "plugin", connector: "legacy-compiler" },
      content: {
        title: `NEWER LEGACY WORK THREAD SOURCE SHOULD NOT STARVE RAW OBSERVATION ${index}`,
        text: "LEGACY DERIVED RECORD SHOULD NOT BECOME WORK_THREAD EVIDENCE even if it mentions github.com pnpm runtime context.",
      },
      privacy: { level: "private", retention: "normal", allow_external_llm: false },
    });
  }

  const result = compileWorkThreadView({
    minutes: 60,
    limit: 1,
    write: false,
    min_score: 0.1,
  }, store);
  const view = result.view;

  assert.equal(result.ok, true);
  assert.ok(view);
  assert.deepEqual(view.source_records, ["record:work-thread-legacy-starvation-visible"]);
  assert.doesNotMatch(JSON.stringify(view.content), /NEWER LEGACY WORK THREAD SOURCE/);
  assert.doesNotMatch(JSON.stringify(view.content), /LEGACY DERIVED RECORD SHOULD NOT BECOME/);
}));

test("runtimeTick ignores legacy derived and episode Records when building candidate threads", async () => withStore(async (store) => {
  store.insertRecord({
    id: "record:runtime-raw-thread-source",
    schema: { name: "observation.browser_page_snapshot", version: 1 },
    source: { type: "browser", connector: "chrome-extension" },
    content: {
      title: "Raw runtime project page",
      url: "https://github.com/example/info",
      text: "Raw observation about context runtime thread routing and work_thread views.",
    },
    privacy: { level: "private", retention: "normal", allow_external_llm: false },
  });
  store.insertRecord({
    id: "record:runtime-raw-local-project",
    schema: { name: "observation.local_project", version: 1 },
    source: { type: "local_project", connector: "runtime-snapshot" },
    scope: { project: "info", project_path: "/Users/junjie/info", app: "terminal" },
    content: {
      title: "Raw local project snapshot",
      path: "/Users/junjie/info",
      text: "Raw local project observation about runtime thread routing and work_thread views.",
    },
    payload: { root: "/Users/junjie/info", files_touched: ["src/runtime/runtime.ts"] },
    privacy: { level: "private", retention: "normal", allow_external_llm: false },
  });
  store.insertRecord({
    id: "record:runtime-derived-legacy",
    schema: { name: "derived.project_memory", version: 1 },
    source: { type: "plugin", connector: "legacy-compiler" },
    content: {
      title: "Legacy derived runtime memory",
      text: "LEGACY DERIVED RUNTIME RECORD SHOULD NOT BECOME CANDIDATE THREAD EVIDENCE github.com pnpm runtime context.",
    },
    privacy: { level: "private", retention: "normal", allow_external_llm: false },
  });
  store.insertRecord({
    id: "record:runtime-episode-legacy",
    schema: { name: "episode.project_work", version: 1 },
    source: { type: "plugin", connector: "legacy-episode" },
    content: {
      title: "Legacy runtime episode",
      text: "LEGACY EPISODE RUNTIME RECORD SHOULD NOT BECOME CANDIDATE THREAD EVIDENCE github.com pnpm runtime context.",
    },
    privacy: { level: "private", retention: "normal", allow_external_llm: false },
  });

  const result = await runtimeTick({
    include_screenpipe: false,
    include_ai_sessions: false,
    include_git: false,
    compile_views: false,
    force: true,
    window_minutes: 60,
    min_score: 0.1,
  }, store);

  assert.equal(result.ok, true);
  assert.ok(result.candidate_threads.length >= 1);
  assert.deepEqual(new Set(result.candidate_threads[0].records.map(record => record.id)), new Set(["record:runtime-raw-thread-source", "record:runtime-raw-local-project"]));
  assert.equal(result.written_threads.length, 1);
  const thread = store.listWorkThreads("candidate")[0];
  assert.deepEqual(new Set(thread.evidence_records), new Set(["record:runtime-raw-thread-source", "record:runtime-raw-local-project"]));
  assert.doesNotMatch(JSON.stringify(thread.metadata), /LEGACY DERIVED RUNTIME RECORD SHOULD NOT BECOME/);
  assert.doesNotMatch(JSON.stringify(thread.metadata), /LEGACY EPISODE RUNTIME RECORD SHOULD NOT BECOME/);
}));
