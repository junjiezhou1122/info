import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ContextStore } from "../src/core/store.js";
import { compileObservationTimeline } from "../src/runtime/timeline.js";
import { compileActivityTimeline } from "../src/runtime/activity-timeline.js";
import { compileProjectTimeline } from "../src/runtime/project-timeline.js";

function withStore(fn: (store: ContextStore) => Promise<void> | void) {
  const dir = mkdtempSync(join(tmpdir(), "info-timeline-test-"));
  const store = new ContextStore(join(dir, "context.sqlite"));
  return Promise.resolve(fn(store)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

function seedLegacyRecords(store: ContextStore) {
  store.insertRecord({
    id: "record:timeline-raw-source",
    schema: { name: "observation.browser_page_snapshot", version: 1 },
    source: { type: "browser", connector: "chrome-extension" },
    scope: { project: "info", project_path: "/Users/junjie/info", domain: "github.com", app: "chrome" },
    content: {
      title: "Raw Info project page",
      url: "https://github.com/example/info",
      text: "Raw observation about context runtime timelines and work_thread views.",
    },
    privacy: { level: "private", retention: "normal", allow_external_llm: false },
  });
  store.insertRecord({
    id: "record:timeline-derived-legacy",
    schema: { name: "derived.project_memory", version: 1 },
    source: { type: "plugin", connector: "legacy-compiler" },
    scope: { project: "info", project_path: "/Users/junjie/info" },
    content: {
      title: "Legacy derived timeline memory",
      text: "LEGACY DERIVED TIMELINE RECORD SHOULD NOT BECOME TIMELINE EVIDENCE.",
    },
    privacy: { level: "private", retention: "normal", allow_external_llm: false },
  });
  store.insertRecord({
    id: "record:timeline-episode-legacy",
    schema: { name: "episode.project_work", version: 1 },
    source: { type: "plugin", connector: "legacy-episode" },
    scope: { project: "info", project_path: "/Users/junjie/info" },
    content: {
      title: "Legacy timeline episode",
      text: "LEGACY EPISODE TIMELINE RECORD SHOULD NOT BECOME TIMELINE EVIDENCE.",
    },
    privacy: { level: "private", retention: "normal", allow_external_llm: false },
  });
}

test("compileObservationTimeline ignores legacy derived and episode Records", () => withStore((store) => {
  seedLegacyRecords(store);

  const result = compileObservationTimeline({ write: false, limit: 20 }, store);

  assert.equal(result.records_used, 1);
  assert.deepEqual(result.view.source_records, ["record:timeline-raw-source"]);
  assert.doesNotMatch(JSON.stringify(result.view.content), /LEGACY DERIVED TIMELINE RECORD/);
  assert.doesNotMatch(JSON.stringify(result.view.content), /LEGACY EPISODE TIMELINE RECORD/);
}));

test("compileActivityTimeline ignores legacy derived and episode Records", () => withStore((store) => {
  seedLegacyRecords(store);

  const result = compileActivityTimeline({ write: false, limit: 20, includeRuntimeEvents: false }, store);

  assert.equal(result.records_used, 1);
  assert.deepEqual(result.view.source_records, ["record:timeline-raw-source"]);
  assert.doesNotMatch(JSON.stringify(result.view.content), /LEGACY DERIVED TIMELINE RECORD/);
  assert.doesNotMatch(JSON.stringify(result.view.content), /LEGACY EPISODE TIMELINE RECORD/);
}));

test("compileActivityTimeline keeps low-level Screenpipe workspace signals out of the default UI timeline", () => withStore((store) => {
  store.insertRecord({
    id: "record:screenpipe-window",
    schema: { name: "observation.screenpipe_activity_summary", version: 1 },
    source: { type: "screenpipe", connector: "screenpipe-activity-summary" },
    scope: { app: "Warp" },
    content: { title: "Warp - ⠇ info", text: "app: Warp\nwindow: ⠇ info\nminutes: 3.5" },
    payload: { app_name: "Warp", window_name: "⠇ info", minutes: 3.5 },
    privacy: { level: "private", retention: "normal" },
  });
  store.insertRecord({
    id: "record:screenpipe-element",
    schema: { name: "observation.screenpipe_workspace_signal", version: 1 },
    source: { type: "screenpipe", connector: "screenpipe-elements" },
    content: { title: "block: git", text: "git" },
    privacy: { level: "private", retention: "normal" },
  });
  store.insertRecord({
    id: "record:screenpipe-input",
    schema: { name: "observation.screenpipe_input_event", version: 1 },
    source: { type: "screenpipe", connector: "screenpipe-local-api" },
    scope: { app: "Tailscale" },
    content: { title: "Tailscale - Input", text: "input" },
    privacy: { level: "private", retention: "normal" },
  });

  const result = compileActivityTimeline({ write: false, limit: 20, includeRuntimeEvents: false }, store);
  const items = result.buckets.flatMap(bucket => bucket.items);

  assert.equal(result.records_used, 1);
  assert.deepEqual(result.view.source_records, ["record:screenpipe-window"]);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Warp - info");
  assert.equal(items[0].subtitle, "Warp · 4m");
  assert.doesNotMatch(JSON.stringify(result.view.content), /block: git/);
  assert.doesNotMatch(JSON.stringify(result.view.content), /Tailscale - Input/);
}));

test("compileActivityTimeline keeps ordinary Screenpipe OCR/search results in the default expanded timeline", () => withStore((store) => {
  store.insertRecord({
    id: "record:screenpipe-window",
    schema: { name: "observation.screenpipe_activity_summary", version: 1 },
    source: { type: "screenpipe", connector: "screenpipe-activity-summary" },
    scope: { app: "Warp" },
    time: { observed_at: "2026-05-25T11:35:00.000Z" },
    content: { title: "Warp - info", text: "app: Warp\nwindow: info\nminutes: 3" },
    payload: { app_name: "Warp", window_name: "info", minutes: 3 },
    privacy: { level: "private", retention: "normal" },
  });
  store.insertRecord({
    id: "record:screenpipe-raw-search",
    schema: { name: "observation.screenpipe_activity", version: 1 },
    source: { type: "screenpipe", connector: "screenpipe-local-api" },
    scope: { app: "Warp" },
    time: { observed_at: "2026-05-25T11:35:10.000Z" },
    content: { title: "Warp - OCR", text: "RAW OCR SHOULD NOT BE MAIN ACTIVITY" },
    payload: { app_name: "Warp", content_type: "OCR" },
    privacy: { level: "private", retention: "normal" },
  });

  const result = compileActivityTimeline({ write: false, limit: 20, includeRuntimeEvents: false }, store);
  const items = result.buckets.flatMap(bucket => bucket.items);

  assert.equal(result.records_used, 2);
  assert.equal(items.length, 2);
  assert.ok(items.every(item => item.kind === "activity"));
  assert.ok(items.some(item => item.title === "Warp - info"));
  assert.match(JSON.stringify(result.view.content), /RAW OCR SHOULD NOT BE MAIN ACTIVITY/);
}));

test("compileActivityTimeline hides Screenpipe recorder and Info Timeline self-observation by default", () => withStore((store) => {
  store.insertRecord({
    id: "record:real-work",
    schema: { name: "observation.screenpipe_activity_summary", version: 1 },
    source: { type: "screenpipe", connector: "screenpipe-activity-summary" },
    scope: { app: "Warp" },
    time: { observed_at: "2026-05-25T11:35:00.000Z" },
    content: { title: "Warp - info", text: "app: Warp\nwindow: info\nminutes: 3" },
    payload: { app_name: "Warp", window_name: "info", minutes: 3 },
    privacy: { level: "private", retention: "normal" },
  });
  store.insertRecord({
    id: "record:screenpipe-recorder",
    schema: { name: "observation.screenpipe_activity_summary", version: 1 },
    source: { type: "screenpipe", connector: "screenpipe-activity-summary" },
    scope: { app: "Terminal" },
    time: { observed_at: "2026-05-25T11:35:10.000Z" },
    content: { title: "Terminal - screenpipe record", text: "npm exec screenpipe@latest record" },
    payload: { app_name: "Terminal", window_name: "junjie - screenpipe ◂ npm exec screenpipe@latest record", minutes: 0.1 },
    privacy: { level: "private", retention: "normal" },
  });
  store.insertRecord({
    id: "record:info-self",
    schema: { name: "observation.browser_page_heartbeat", version: 1 },
    source: { type: "browser", connector: "chrome-extension" },
    scope: { app: "chrome", domain: "localhost" },
    time: { observed_at: "2026-05-25T11:35:20.000Z" },
    content: { title: "Info Runtime · Timeline", text: "Timeline Live sync", url: "http://localhost:5177/" },
    payload: { browser_url: "http://localhost:5177/" },
    privacy: { level: "private", retention: "normal" },
  });

  const result = compileActivityTimeline({ write: false, limit: 20, includeRuntimeEvents: false }, store);
  const items = result.buckets.flatMap(bucket => bucket.items);

  assert.equal(result.records_used, 1);
  assert.deepEqual(result.view.source_records, ["record:real-work"]);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Warp - info");
  assert.doesNotMatch(JSON.stringify(result.view.content), /screenpipe@latest record/);
  assert.doesNotMatch(JSON.stringify(result.view.content), /Info Runtime/);
}));

test("compileActivityTimeline keeps recorder and self-observation available in low-level debug mode", () => withStore((store) => {
  store.insertRecord({
    id: "record:screenpipe-recorder",
    schema: { name: "observation.screenpipe_activity_summary", version: 1 },
    source: { type: "screenpipe", connector: "screenpipe-activity-summary" },
    scope: { app: "Terminal" },
    time: { observed_at: "2026-05-25T11:35:10.000Z" },
    content: { title: "Terminal - screenpipe record", text: "npm exec screenpipe@latest record" },
    payload: { app_name: "Terminal", window_name: "junjie - screenpipe ◂ npm exec screenpipe@latest record", minutes: 0.1 },
    privacy: { level: "private", retention: "normal" },
  });
  store.insertRecord({
    id: "record:info-self",
    schema: { name: "observation.browser_page_heartbeat", version: 1 },
    source: { type: "browser", connector: "chrome-extension" },
    scope: { app: "chrome", domain: "localhost" },
    time: { observed_at: "2026-05-25T11:35:20.000Z" },
    content: { title: "Info Runtime · Timeline", text: "Timeline Live sync", url: "http://localhost:5177/" },
    payload: { browser_url: "http://localhost:5177/" },
    privacy: { level: "private", retention: "normal" },
  });

  const result = compileActivityTimeline({ write: false, limit: 20, includeRuntimeEvents: false, includeLowLevelScreenpipe: true }, store);

  assert.equal(result.records_used, 2);
  assert.match(JSON.stringify(result.view.content), /screenpipe@latest record/);
  assert.match(JSON.stringify(result.view.content), /Info Runtime/);
}));

test("compileActivityTimeline applies source filter before limiting candidates", () => withStore((store) => {
  for (let index = 0; index < 4; index += 1) {
    store.insertRecord({
      id: `record:browser-heartbeat-${index}`,
      schema: { name: "observation.browser_page_heartbeat", version: 1 },
      source: { type: "browser", connector: "chrome-extension" },
      scope: { app: "chrome", domain: "youtube.com" },
      content: { title: `Browser page ${index}`, url: `https://www.youtube.com/watch?v=${index}` },
      privacy: { level: "private", retention: "normal" },
    });
  }
  for (let index = 0; index < 80; index += 1) {
    store.insertRecord({
      id: `record:screenpipe-noise-${index}`,
      schema: { name: "observation.screenpipe_activity", version: 1 },
      source: { type: "screenpipe", connector: "screenpipe-local-api" },
      scope: { app: "Warp" },
      content: { title: `Screenpipe OCR ${index}`, text: "terminal noise" },
      payload: { app_name: "Warp", content_type: "OCR" },
      privacy: { level: "private", retention: "normal" },
    });
  }

  const result = compileActivityTimeline({ write: false, limit: 3, includeRuntimeEvents: false, sourceFilter: "browser", summarizeHeartbeats: false }, store);
  const items = result.buckets.flatMap(bucket => bucket.items);

  assert.equal(result.records_used, 3);
  assert.equal(items.length, 3);
  assert.ok(items.every(item => item.source === "browser/chrome-extension"));
}));

test("compileActivityTimeline can merge continuous browser page samples", () => withStore((store) => {
  for (const [index, observed] of [
    [0, "2026-05-25T11:35:00.000Z"],
    [1, "2026-05-25T11:36:00.000Z"],
    [2, "2026-05-25T11:37:30.000Z"],
  ] as const) {
    store.insertRecord({
      id: `record:browser-youtube-${index}`,
      schema: { name: "observation.browser_page_heartbeat", version: 1 },
      source: { type: "browser", connector: "chrome-extension" },
      scope: { app: "chrome", domain: "youtube.com" },
      time: { observed_at: observed },
      content: { title: "(119) Lecture 1 - YouTube", url: "https://www.youtube.com/watch?v=lecture" },
      payload: { dwell_seconds: 60 + index },
      privacy: { level: "private", retention: "normal" },
    });
  }

  const result = compileActivityTimeline({
    write: false,
    limit: 20,
    includeRuntimeEvents: false,
    dedupe: false,
    summarizeHeartbeats: false,
    mergeContinuous: true,
    mergeGapMinutes: 3,
  }, store);
  const items = result.buckets.flatMap(bucket => bucket.items);

  assert.equal(result.records_used, 3);
  assert.equal(items.length, 1);
  assert.equal(items[0].stats?.merged_continuous, true);
  assert.equal(items[0].stats?.samples, 3);
  assert.deepEqual(items[0].record_ids, ["record:browser-youtube-0", "record:browser-youtube-1", "record:browser-youtube-2"]);
}));

test("compileActivityTimeline does not split continuous browser duration on selected text evidence", () => withStore((store) => {
  for (const [index, observed] of [
    [0, "2026-05-25T14:11:00.000Z"],
    [1, "2026-05-25T14:12:00.000Z"],
    [2, "2026-05-25T14:13:00.000Z"],
  ] as const) {
    store.insertRecord({
      id: `record:browser-video-heartbeat-${index}`,
      schema: { name: "observation.browser_page_heartbeat", version: 1 },
      source: { type: "browser", connector: "chrome-extension" },
      scope: { app: "chrome", domain: "www.youtube.com" },
      time: { observed_at: observed },
      content: { title: "(119) Lecture 1 - YouTube", url: "https://www.youtube.com/watch?v=lecture" },
      privacy: { level: "private", retention: "normal" },
    });
  }
  store.insertRecord({
    id: "record:browser-video-selection",
    schema: { name: "observation.browser_text_selected", version: 1 },
    source: { type: "browser", connector: "chrome-extension" },
    scope: { app: "chrome", domain: "www.youtube.com" },
    time: { observed_at: "2026-05-25T14:12:30.000Z" },
    content: { title: "(119) Lecture 1 - YouTube", text: "115K", url: "https://www.youtube.com/watch?v=lecture" },
    privacy: { level: "private", retention: "normal" },
  });

  const result = compileActivityTimeline({
    write: false,
    limit: 20,
    includeRuntimeEvents: false,
    dedupe: false,
    summarizeHeartbeats: false,
    mergeContinuous: true,
    mergeGapMinutes: 3,
  }, store);
  const items = result.buckets.flatMap(bucket => bucket.items);
  const merged = items.find(item => item.stats?.merged_continuous);

  assert.equal(result.records_used, 4);
  assert.equal(items.length, 2);
  assert.ok(merged);
  assert.equal(merged.stats?.samples, 3);
  assert.match(merged.subtitle ?? "", /2m/);
  assert.deepEqual(merged.record_ids, [
    "record:browser-video-heartbeat-0",
    "record:browser-video-heartbeat-1",
    "record:browser-video-heartbeat-2",
  ]);
}));

test("compileActivityTimeline dedupes repeated Screenpipe activity summaries to the latest expanded row", () => withStore((store) => {
  for (const [id, observed, minutes] of [
    ["one", "2026-05-25T11:35:00.000Z", 14],
    ["two", "2026-05-25T11:36:00.000Z", 3],
  ] as const) {
    store.insertRecord({
      id: `record:screenpipe-window-${id}`,
      schema: { name: "observation.screenpipe_activity_summary", version: 1 },
      source: { type: "screenpipe", connector: "screenpipe-activity-summary" },
      scope: { app: "Warp" },
      time: { observed_at: observed },
      content: { title: "Warp - info", text: "app: Warp\nwindow: info" },
      payload: { app_name: "Warp", window_name: "info", minutes },
      privacy: { level: "private", retention: "normal" },
    });
  }

  const result = compileActivityTimeline({ write: false, limit: 20, includeRuntimeEvents: false }, store);
  const items = result.buckets.flatMap(bucket => bucket.items);

  assert.equal(result.records_used, 2);
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "activity");
  assert.equal(items[0].subtitle, "Warp · 3m");
  assert.deepEqual(items[0].record_ids, ["record:screenpipe-window-two"]);
}));

test("compileActivityTimeline can disable dedupe for evidence inspection", () => withStore((store) => {
  for (const [id, observed, minutes] of [
    ["one", "2026-05-25T11:35:00.000Z", 14],
    ["two", "2026-05-25T11:36:00.000Z", 3],
  ] as const) {
    store.insertRecord({
      id: `record:screenpipe-window-${id}`,
      schema: { name: "observation.screenpipe_activity_summary", version: 1 },
      source: { type: "screenpipe", connector: "screenpipe-activity-summary" },
      scope: { app: "Warp" },
      time: { observed_at: observed },
      content: { title: "Warp - info", text: "app: Warp\nwindow: info" },
      payload: { app_name: "Warp", window_name: "info", minutes },
      privacy: { level: "private", retention: "normal" },
    });
  }

  const result = compileActivityTimeline({ write: false, limit: 20, includeRuntimeEvents: false, dedupe: false }, store);
  const items = result.buckets.flatMap(bucket => bucket.items);

  assert.equal(result.records_used, 2);
  assert.equal(items.length, 2);
  assert.deepEqual(items.map(item => item.record_ids?.[0]), ["record:screenpipe-window-two", "record:screenpipe-window-one"]);
}));

test("compileActivityTimeline can include complete low-level Screenpipe details for source inspection", () => withStore((store) => {
  store.insertRecord({
    id: "record:screenpipe-frame-context-complete",
    schema: { name: "observation.screenpipe_workspace_signal", version: 1 },
    source: { type: "screenpipe", connector: "screenpipe-frame-context" },
    content: { title: "Screenpipe frame context 9480", text: "~/info.main ui/src/main.tsx /Users/junjie/info" },
    payload: { content_type: "frame_context", frame_id: 9480, text_source: "ocr", node_count: 42 },
    privacy: { level: "private", retention: "normal" },
  });

  const result = compileActivityTimeline({ write: false, limit: 20, includeRuntimeEvents: false, includeLowLevelScreenpipe: true }, store);
  const item = result.buckets.flatMap(bucket => bucket.items)[0];

  assert.equal(result.records_used, 1);
  assert.equal(item.schema, "observation.screenpipe_workspace_signal");
  assert.ok((item.text ?? "").includes("/Users/junjie/info"));
  assert.equal(item.stats?.frame_id, 9480);
  assert.equal(item.stats?.content_type, "frame_context");
}));

test("compileActivityTimeline drops Screenpipe Timeline self-observation echoes", () => withStore((store) => {
  store.insertRecord({
    id: "record:screenpipe-frame-context-real",
    schema: { name: "observation.screenpipe_workspace_signal", version: 1 },
    source: { type: "screenpipe", connector: "screenpipe-frame-context" },
    content: { title: "Screenpipe frame context 9480", text: "~/info.main ui/src/main.tsx /Users/junjie/info" },
    payload: { content_type: "frame_context", frame_id: 9480, text_source: "ocr", node_count: 42 },
    privacy: { level: "private", retention: "normal" },
  });
  store.insertRecord({
    id: "record:screenpipe-frame-context-echo",
    schema: { name: "observation.screenpipe_workspace_signal", version: 1 },
    source: { type: "screenpipe", connector: "screenpipe-frame-context" },
    content: {
      title: "Screenpipe frame context 9913",
      text: "Timeline Live sync Screenpipe frame context 9903 observation.screenpipe_workspace content_type: frame_context frame_id: 9903 text_source: accessibility",
    },
    payload: { content_type: "frame_context", frame_id: 9913, text_source: "ocr", node_count: 0 },
    privacy: { level: "private", retention: "normal" },
  });

  const result = compileActivityTimeline({ write: false, limit: 20, includeRuntimeEvents: false, includeLowLevelScreenpipe: true }, store);
  const items = result.buckets.flatMap(bucket => bucket.items);

  assert.equal(result.records_used, 1);
  assert.deepEqual(result.view.source_records, ["record:screenpipe-frame-context-real"]);
  assert.equal(items.length, 1);
  assert.equal(items[0].stats?.frame_id, 9480);
  assert.doesNotMatch(JSON.stringify(result.view.content), /frame_id: 9903/);
}));

test("compileActivityTimeline promotes Screenpipe frame URLs and labels UI blocks clearly", () => withStore((store) => {
  store.insertRecord({
    id: "record:screenpipe-frame-url",
    schema: { name: "observation.screenpipe_workspace_signal", version: 1 },
    source: { type: "screenpipe", connector: "screenpipe-frame-context" },
    scope: { domain: "tech.genius.com" },
    content: { title: "Screenpipe frame context 9508", text: "Sam Altman lecture", url: "http://tech.genius.com/Sam-altman-lecture" },
    payload: { content_type: "frame_context", frame_id: 9508, browser_url: "http://tech.genius.com/Sam-altman-lecture" },
    privacy: { level: "private", retention: "normal" },
  });
  store.insertRecord({
    id: "record:screenpipe-block-label",
    schema: { name: "observation.screenpipe_workspace_signal", version: 1 },
    source: { type: "screenpipe", connector: "screenpipe-elements" },
    content: { title: "block: /Users/junjie/info", text: "/Users/junjie/info" },
    payload: { content_type: "element", role: "block", frame_id: 9508 },
    privacy: { level: "private", retention: "normal" },
  });

  const result = compileActivityTimeline({ write: false, limit: 20, includeRuntimeEvents: false, includeLowLevelScreenpipe: true }, store);
  const items = result.buckets.flatMap(bucket => bucket.items);

  assert.ok(items.some(item => item.title === "Web frame: tech.genius.com/Sam-altman-lecture" && item.domain === "tech.genius.com"));
  assert.ok(items.some(item => item.title === "UI block: /Users/junjie/info"));
}));

test("compileActivityTimeline dedupes Screenpipe terminal spinner window titles", () => withStore((store) => {
  for (const [id, spinner] of [["one", "⠇"], ["two", "⠏"]] as const) {
    store.insertRecord({
      id: `record:screenpipe-spinner-${id}`,
      schema: { name: "observation.screenpipe_activity_summary", version: 1 },
      source: { type: "screenpipe", connector: "screenpipe-activity-summary" },
      scope: { app: "Warp" },
      time: { observed_at: "2026-05-25T08:40:00.000Z" },
      content: { title: `Warp - ${spinner} info` },
      payload: { app_name: "Warp", window_name: `${spinner} info`, minutes: 1 },
      privacy: { level: "private", retention: "normal" },
    });
  }

  const result = compileActivityTimeline({ write: false, limit: 20, includeRuntimeEvents: false }, store);
  const items = result.buckets.flatMap(bucket => bucket.items);

  assert.equal(result.records_used, 2);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Warp - info");
}));

test("compileProjectTimeline ignores legacy derived and episode Records", () => withStore((store) => {
  seedLegacyRecords(store);

  const result = compileProjectTimeline({ write: false, project: "info", limit: 20, includeStoredWorkThreads: false }, store);

  assert.equal(result.records_used, 1);
  assert.deepEqual(result.view.source_records, ["record:timeline-raw-source"]);
  assert.doesNotMatch(JSON.stringify(result.view.content), /LEGACY DERIVED TIMELINE RECORD/);
  assert.doesNotMatch(JSON.stringify(result.view.content), /LEGACY EPISODE TIMELINE RECORD/);
}));
