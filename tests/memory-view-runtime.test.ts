import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ContextStore } from "../src/core/store.js";
import { compileEvidenceViews } from "../src/runtime/evidence-view.js";
import { compileActivityViews, compileProposalViews, buildMemoryView } from "../src/runtime/memory-views.js";
import { runtimeTick } from "../src/runtime/runtime.js";

function withStore(fn: (store: ContextStore) => Promise<void> | void) {
  const dir = mkdtempSync(join(tmpdir(), "info-memory-view-runtime-test-"));
  const store = new ContextStore(join(dir, "context.sqlite"));
  return Promise.resolve(fn(store)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

test("ActivityView composes continuous page EvidenceViews through source_views", () => withStore((store) => {
  const base = Date.now() - 3 * 60_000;
  for (const [index, observedAt] of [
    [0, new Date(base).toISOString()],
    [1, new Date(base + 60_000).toISOString()],
    [2, new Date(base + 150_000).toISOString()],
  ] as const) {
    store.insertRecord({
      id: `record:page-${index}`,
      schema: { name: "observation.browser_page_heartbeat", version: 1 },
      source: { type: "browser", connector: "chrome-extension" },
      scope: { app: "Chrome", domain: "youtube.com" },
      time: { observed_at: observedAt },
      content: {
        title: "Lecture 1 - YouTube",
        url: "https://www.youtube.com/watch?v=lecture",
      },
      payload: { dwell_seconds: 60 + index, scroll_depth: 0.4 },
      privacy: { level: "private", retention: "normal" },
    });
  }

  const evidenceResult = compileEvidenceViews({ write: true, minutes: 60 }, store);
  const result = compileActivityViews({ write: true, evidenceViews: evidenceResult.views, mergeGapMinutes: 3 }, store);
  const activities = store.listViews({ view_types: ["activity"], limit: 10 });

  assert.equal(result.views.length, 1);
  assert.equal(activities.length, 1);
  assert.equal(activities[0].content?.kind, "resource_consumption");
  assert.equal((activities[0].content?.resource as Record<string, unknown>).url, "https://www.youtube.com/watch?v=lecture");
  assert.equal((activities[0].content?.evidence_summary as Record<string, unknown>).evidence_views, 3);
  assert.equal(activities[0].source_records?.length, 3);
  assert.equal(activities[0].source_views?.length, 3);
  assert.ok(activities[0].source_views?.every(id => id.startsWith("evidence:")));
}));

test("ProposalView proposes resource, intent, and workflow Views from ActivityViews", () => withStore((store) => {
  const evidence = store.upsertView({
    id: "evidence:test-page",
    view_type: "evidence",
    title: "Lecture 1 - YouTube",
    source_records: ["record:page"],
    content: {
      kind: "page",
      observed_at: "2026-05-25T10:00:00.000Z",
      origin: { schema: "observation.browser_page_heartbeat", source: "browser" },
      subject: { type: "page", app: "Chrome", title: "Lecture 1 - YouTube", url: "https://www.youtube.com/watch?v=lecture", domain: "youtube.com" },
      signals: { duration_seconds: 600 },
      claims: ["url_seen", "resource_seen"],
    },
  });
  const activity = store.upsertView({
    id: "activity:test-watch",
    view_type: "activity",
    title: "Lecture 1 - YouTube",
    source_records: ["record:page"],
    source_views: [evidence.id],
    content: {
      kind: "resource_consumption",
      start: "2026-05-25T10:00:00.000Z",
      end: "2026-05-25T10:10:00.000Z",
      duration_minutes: 10,
      app: "Chrome",
      resource: { type: "url", url: "https://www.youtube.com/watch?v=lecture", title: "Lecture 1 - YouTube", domain: "youtube.com" },
      action: "watching_or_reading",
    },
  });

  const result = compileProposalViews({ write: true, activityViews: [activity] }, store);
  const proposal = result.views[0];
  const proposed = proposal.content?.proposed_views as Array<Record<string, unknown>>;

  assert.equal(proposal.view_type, "proposal");
  assert.equal(proposal.content?.kind, "view_proposal");
  assert.deepEqual(proposal.source_views, [activity.id]);
  assert.ok(proposed.some(item => item.view_type === "resource" && item.kind === "learning_material"));
  assert.ok(proposed.some(item => item.view_type === "intent" && item.kind === "candidate"));
  assert.ok(proposed.some(item => item.view_type === "workflow" && item.kind === "learning_session"));
}));

test("MemoryView captures durable behavior-changing knowledge with provenance", () => {
  const memory = buildMemoryView({
    id: "memory:test-observation-view-pattern",
    title: "Observation to View architecture",
    kind: "project_pattern",
    claim: "Raw observations stay fixed while purpose-specific Views are generated through typed compression.",
    applies_to: ["Info runtime", "memory architecture"],
    future_use: ["Prefer View-based derived state over mutating observations"],
    source_views: ["workflow:test"],
    confidence: 0.84,
  });

  assert.equal(memory.view_type, "memory");
  assert.equal(memory.content?.kind, "project_pattern");
  assert.equal(memory.stability, "project");
  assert.equal(memory.lossiness, "high");
  assert.deepEqual(memory.source_views, ["workflow:test"]);
  assert.match(String(memory.purpose), /future behavior/);
});

test("runtimeTick compiles EvidenceView, ActivityView, and ProposalView families", async () => withStore(async (store) => {
  store.insertRecord({
    id: "record:runtime-memory-view-page",
    schema: { name: "observation.browser_page_heartbeat", version: 1 },
    source: { type: "browser", connector: "chrome-extension" },
    scope: { project: "info", project_path: "/Users/junjie/info", domain: "youtube.com", app: "Chrome" },
    content: {
      title: "Memory systems lecture - YouTube",
      url: "https://www.youtube.com/watch?v=memory",
      text: "Long-term memory and activity view design.",
    },
    payload: { dwell_seconds: 180, scroll_depth: 0.2 },
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

  assert.equal(result.ok, true);
  assert.ok(result.compiled_views.some(view => view.view_type === "evidence"));
  assert.ok(result.compiled_views.some(view => view.view_type === "activity"));
  assert.ok(result.compiled_views.some(view => view.view_type === "proposal"));
  assert.ok(store.listViews({ view_types: ["evidence"], limit: 10 }).length >= 1);
  assert.ok(store.listViews({ view_types: ["activity"], limit: 10 }).length >= 1);
  assert.ok(store.listViews({ view_types: ["proposal"], limit: 10 }).length >= 1);
}));
