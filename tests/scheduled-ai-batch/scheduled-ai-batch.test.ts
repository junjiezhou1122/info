import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ContextStore, type StoredContextRecord } from "@info/core";
import {
  SCHEDULED_AI_BATCH_VIEW_TYPE,
  buildCandidateRoutes,
  buildRouteCandidateRecord,
  extractRouteFeatures,
  runScheduledAiBatch,
} from "@info/processor-runtime";
import { processScheduledAiBatch } from "@info/runtime";
import { compileWorkFocusSet } from "@info/views";

function withStore(fn: (store: ContextStore) => Promise<void> | void) {
  const dir = mkdtempSync(join(tmpdir(), "info-scheduled-ai-batch-test-"));
  const store = new ContextStore(join(dir, "context.sqlite"));
  return Promise.resolve(fn(store)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

test("scheduled AI batch dry-run returns a view without writing it", () => withStore(async (store) => {
  const { records, focusSet } = seedBatch(store);

  const result = await runScheduledAiBatch({
    records,
    focusSetViews: [focusSet as any],
    write: false,
    now: new Date("2026-06-16T10:15:00.000Z"),
  }, store);

  assert.equal(result.dry_run, true);
  assert.equal(result.views_written.length, 0);
  assert.equal(result.view.view_type, SCHEDULED_AI_BATCH_VIEW_TYPE);
  assert.equal(store.listViews({ view_types: [SCHEDULED_AI_BATCH_VIEW_TYPE], limit: 10 }).length, 0);
  assert.ok(result.main_work.some(item => item.item_id === "obs:project"));
  assert.ok(result.interruptions.some(item => item.item_id === "obs:chat"));
}));

test("scheduled AI batch write mode upserts an idempotent suggestions view", () => withStore(async (store) => {
  const { records, focusSet } = seedBatch(store);
  const options = {
    records,
    focusSetViews: [focusSet as any],
    write: true,
    now: new Date("2026-06-16T10:15:00.000Z"),
    batch_id: "batch:fixed",
  };

  const first = await runScheduledAiBatch(options, store);
  const second = await runScheduledAiBatch(options, store);

  assert.deepEqual(first.views_written, second.views_written);
  assert.equal(store.listViews({ view_types: [SCHEDULED_AI_BATCH_VIEW_TYPE], limit: 10 }).length, 1);
  const view = store.getView(first.views_written[0]);
  assert.equal(view?.compiler?.id, "processor.scheduled_ai_batch");
  assert.equal(view?.compiler?.mode, "deterministic");
  assert.equal((view?.content?.main_work as any[])?.[0]?.item_id, "obs:project");
}));

test("scheduled AI batch falls back deterministically when the LLM is unavailable", () => withStore(async (store) => {
  const { records, focusSet } = seedBatch(store);

  const result = await runScheduledAiBatch({
    records,
    focusSetViews: [focusSet as any],
    write: true,
    use_llm: true,
    llm: { base_url: "https://llm.invalid.example/v1", model: "missing", allow_external: false },
    now: new Date("2026-06-16T10:15:00.000Z"),
    batch_id: "batch:fallback",
  }, store);

  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.deterministic_fallback, true);
  assert.match(String(result.diagnostics.llm_error), /external LLM disabled|missing|failed|fetch/i);
  assert.ok(result.main_work.some(item => item.item_id === "obs:project"));
  assert.ok(result.interruptions.some(item => item.item_id === "obs:chat"));
  const view = store.getView(result.views_written[0]);
  assert.equal(view?.compiler?.mode, "deterministic");
}));

test("runtime scheduled AI batch honors interval and force controls", () => withStore(async (store) => {
  seedBatch(store);

  const first = await processScheduledAiBatch({
    mode: "scheduled",
    write: true,
    now: new Date("2026-06-16T10:15:00.000Z"),
    batch_id: "batch:runtime",
    interval_seconds: 900,
  }, store);
  assert.equal("skipped" in first, false);

  const skipped = await processScheduledAiBatch({
    mode: "scheduled",
    write: true,
    now: new Date("2026-06-16T10:20:00.000Z"),
    interval_seconds: 900,
  }, store);
  assert.equal("skipped" in skipped && skipped.skipped, true);
  assert.equal("reason" in skipped && skipped.reason, "interval_not_due");

  const forced = await processScheduledAiBatch({
    mode: "scheduled",
    write: true,
    force: true,
    now: new Date("2026-06-16T10:20:00.000Z"),
    batch_id: "batch:runtime-forced",
    interval_seconds: 900,
  }, store);
  assert.equal("skipped" in forced, false);
  assert.equal(store.getRuntimeState("scheduled_ai_batch")?.value.last_view_id, "work.ai_batch_suggestions:batch:runtime-forced");
}));

function seedBatch(store: ContextStore) {
  const project = store.insertRecord(sourceRecord("obs:project", "observation.ai_session_locator_result", {
    scope: { project: "info", project_path: "/Users/junjie/info", session: "codex-info" },
    content: { title: "Implement Scheduled AI Batch layer", text: "packages/processor-runtime scheduled batch work" },
    payload: { cwd: "/Users/junjie/info", session_id: "codex-info", files_touched: ["packages/processor-runtime/scheduled-ai-batch.ts"] },
  }));
  const docs = store.insertRecord(sourceRecord("obs:docs", "observation.browser_page_snapshot", {
    scope: { app: "chrome", domain: "nodejs.org" },
    content: { title: "Node test runner docs", url: "https://nodejs.org/api/test.html", text: "node --test documentation for TypeScript tests" },
  }));
  const chat = store.insertRecord(sourceRecord("obs:chat", "observation.screenpipe_activity", {
    scope: { app: "Slack" },
    content: { title: "Slack", text: "quick unrelated message from another channel" },
    payload: { app_name: "Slack" },
  }));
  const routeProject = store.insertRecord(routeCandidateFor(project));
  const routeDocs = store.insertRecord(routeCandidateFor(docs, [routeProject]));
  const routeChat = store.insertRecord(routeCandidateFor(chat));
  const focusSet = compileWorkFocusSet({
    records: [project, docs, chat, routeProject, routeDocs, routeChat],
    write: true,
    now: new Date("2026-06-16T10:10:00.000Z"),
  }, store).view;
  return {
    records: [project, docs, chat, routeProject, routeDocs, routeChat],
    focusSet,
  };
}

function routeCandidateFor(source: StoredContextRecord, recent: StoredContextRecord[] = []) {
  const features = extractRouteFeatures(source);
  return buildRouteCandidateRecord(source, features, buildCandidateRoutes(features, recent), new Date("2026-06-16T10:00:00.000Z"));
}

function sourceRecord(id: string, schemaName: string, overrides: Partial<StoredContextRecord>): StoredContextRecord {
  const now = "2026-06-16T10:00:00.000Z";
  return {
    id,
    schema: { name: schemaName, version: 1 },
    source: { type: schemaName.includes("browser") ? "browser" : schemaName.includes("screenpipe") ? "screenpipe" : "ai_session" },
    scope: {},
    time: { observed_at: now, captured_at: now },
    content: {},
    payload: {},
    privacy: { level: "private", retention: "normal", allow_external_llm: false },
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}
