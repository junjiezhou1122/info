import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ContextStore } from "@info/core";
import { III_CASCADE_FUNCTIONS, III_CONTEXT_FUNCTIONS, III_PROGRAM_FUNCTIONS, InProcessIiiRuntimeClient, registerInfoIiiRuntime, VIEW_WORKER_FUNCTIONS } from "@info/iii-runtime";
import { signalFromRecord, signalFromView } from "@info/programs/signals.js";

async function withStore(fn: (store: ContextStore) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), "info-iii-runtime-test-"));
  const store = new ContextStore(join(dir, "context.sqlite"));
  try {
    await fn(store);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("@info/iii-runtime registers view compiler functions as first-class iii functions", async () => withStore(async (store) => {
  const iii = new InProcessIiiRuntimeClient();
  const result = await registerInfoIiiRuntime(iii, { store });

  assert.equal(result.ok, true);
  assert.equal(iii.functions.has(VIEW_WORKER_FUNCTIONS.evidence), true);
  assert.equal(iii.functions.has(VIEW_WORKER_FUNCTIONS.activity), true);
  assert.equal(iii.functions.has(VIEW_WORKER_FUNCTIONS.workThread), true);
  assert.ok(iii.triggers.length >= result.functions_registered.length);
}));

test("@info/iii-runtime registers default programs and capabilities as iii functions", async () => withStore(async (store) => {
  const iii = new InProcessIiiRuntimeClient();
  await registerInfoIiiRuntime(iii, { store });

  assert.equal(iii.functions.has("program::browser_ambient"), true);
  assert.equal(iii.functions.has("program::project_ambient"), true);
  assert.equal(iii.functions.has(III_PROGRAM_FUNCTIONS.agentTaskSubmit), true);
  assert.equal(iii.functions.has("capability::browser_ambient_explore"), true);
}));

test("direct capability iii workers preserve ProgramRuntime capability provenance events", async () => withStore(async (store) => {
  const record = store.insertRecord({
    id: "record:iii-direct-browser-capability",
    schema: { name: "observation.browser_page_snapshot", version: 1 },
    source: { type: "browser", connector: "test" },
    content: { title: "iii direct capability", text: "Direct capability worker should keep provenance events.", url: "https://github.com/example/repo" },
    privacy: { level: "private", retention: "normal", allow_external_llm: true },
  });
  const iii = new InProcessIiiRuntimeClient();
  await registerInfoIiiRuntime(iii, { store });

  const response = await iii.trigger({
    function_id: "capability::browser_ambient_explore",
    payload: {
      signal: signalFromRecord(record),
      autonomy: "suggest",
      speed: "glance",
    },
  }) as { result?: { ok?: boolean; diagnostics?: Record<string, unknown>; written_records?: string[]; written_views?: string[] } };

  assert.equal(response.result?.ok, true);
  assert.deepEqual(response.result?.written_records, []);
  assert.deepEqual(response.result?.written_views, []);
  assert.equal((response.result?.diagnostics?.classification as { kind?: string } | undefined)?.kind, "github_repo");
  assert.ok(store.listRuntimeEvents({ event_type: "capability.run.started", plugin_id: "capability.browser_ambient.explore", limit: 1 })[0]);
  assert.ok(store.listRuntimeEvents({ event_type: "capability.run.completed", plugin_id: "capability.browser_ambient.explore", limit: 1 })[0]);
}));

test("program iii workers invoke capabilities through iii while preserving requested program metadata", async () => withStore(async (store) => {
  const oldRuntime = process.env.BROWSER_AMBIENT_AGENT_TASK_RUNTIME;
  process.env.BROWSER_AMBIENT_AGENT_TASK_RUNTIME = "local_mock";
  try {
    const record = store.insertRecord({
      id: "record:iii-program-capability",
      schema: { name: "observation.browser_page_snapshot", version: 1 },
      source: { type: "browser", connector: "test" },
      content: { title: "iii program capability", text: "Program worker should invoke AgentTask capability through iii.", url: "https://github.com/example/repo" },
      privacy: { level: "private", retention: "normal", allow_external_llm: true },
    });
    const iii = new InProcessIiiRuntimeClient();
    await registerInfoIiiRuntime(iii, { store });

    const response = await iii.trigger({
      function_id: "program::browser_ambient",
      payload: {
        signal: signalFromRecord(record),
        autonomy: "suggest",
        speed: "glance",
      },
    }) as { result?: { ok?: boolean; runs?: Array<{ written_views?: string[] }> } };
    const viewId = response.result?.runs?.[0]?.written_views?.[0];
    const view = viewId ? store.getView(viewId) : undefined;

    assert.equal(response.result?.ok, true);
    assert.ok(view);
    assert.equal(view.view_type, "analysis.browser_agent_task");
    assert.equal(view.metadata?.requested_by_program, "program.browser_ambient");
    assert.equal(store.listRuntimeEvents({ event_type: "capability.run.completed", plugin_id: "capability.agent_task.submit", limit: 1 })[0]?.payload?.program_id, "program.browser_ambient");
  } finally {
    if (oldRuntime === undefined) delete process.env.BROWSER_AMBIENT_AGENT_TASK_RUNTIME;
    else process.env.BROWSER_AMBIENT_AGENT_TASK_RUNTIME = oldRuntime;
  }
}));

test("aggregate program iii workers honor routing.shortcut Views before fan-out", async () => withStore(async (store) => {
  const oldRuntime = process.env.BROWSER_AMBIENT_AGENT_TASK_RUNTIME;
  process.env.BROWSER_AMBIENT_AGENT_TASK_RUNTIME = "local_mock";
  try {
    const record = store.insertRecord({
      id: "record:iii-routing-shortcut",
      schema: { name: "observation.browser_page_snapshot", version: 1 },
      source: { type: "browser", connector: "test" },
      content: { title: "iii route", text: "Routing shortcut should select browser ambient only.", url: "https://github.com/example/repo" },
      privacy: { level: "private", retention: "normal", allow_external_llm: true },
    });
    store.upsertView({
      id: "routing:iii-browser-ambient",
      view_type: "routing.shortcut",
      title: "Route browser snapshots to Browser Ambient",
      content: {
        program_id: "program.browser_ambient",
        match: { object_kind: "observation", source: "browser", domain: "github.com" },
      },
      confidence: 0.9,
      privacy: { level: "private", retention: "normal" },
    });
    const iii = new InProcessIiiRuntimeClient();
    await registerInfoIiiRuntime(iii, { store });

    const response = await iii.trigger({
      function_id: III_PROGRAM_FUNCTIONS.processRecord,
      payload: {
        record_id: record.id,
        autonomy: "suggest",
        speed: "glance",
      },
    }) as { result?: { diagnostics?: { selected_program_ids?: string[]; routing_shortcut_view_id?: string } } };

    assert.deepEqual(response.result?.diagnostics?.selected_program_ids, ["program.browser_ambient"]);
    assert.equal(response.result?.diagnostics?.routing_shortcut_view_id, "routing:iii-browser-ambient");
  } finally {
    if (oldRuntime === undefined) delete process.env.BROWSER_AMBIENT_AGENT_TASK_RUNTIME;
    else process.env.BROWSER_AMBIENT_AGENT_TASK_RUNTIME = oldRuntime;
  }
}));

test("agent task capability runs as a direct iii function and writes returned Views", async () => withStore(async (store) => {
  const oldRuntime = process.env.PROACTIVE_RESEARCH_AGENT_TASK_RUNTIME;
  process.env.PROACTIVE_RESEARCH_AGENT_TASK_RUNTIME = "local_mock";
  try {
    const source = store.insertRecord({
      id: "record:iii-agent-task-source",
      schema: { name: "observation.local_project", version: 1 },
      source: { type: "local_project", connector: "test" },
      content: { title: "iii agent task source", text: "Direct capability worker should write agent output." },
      privacy: { level: "private", retention: "normal", allow_external_llm: true },
    });
    const taskView = store.upsertView({
      id: "task:iii-agent-task",
      view_type: "task.background_research",
      title: "iii direct agent task",
      source_records: [source.id],
      content: { goal: "Prepare a short background research note." },
      privacy: { level: "private", retention: "normal", allow_external_llm: true },
    });
    const iii = new InProcessIiiRuntimeClient();
    await registerInfoIiiRuntime(iii, { store });

    const response = await iii.trigger({
      function_id: III_PROGRAM_FUNCTIONS.agentTaskSubmit,
      payload: {
        signal: signalFromView(taskView),
        autonomy: "suggest",
        speed: "background",
        payload: {
          task: {
            runtime: "local_mock",
            goal: "Prepare a short background research note.",
            output_contract: {
              view_type: "brief.background_research",
              title: "Background research from iii function",
              purpose: "Test direct iii capability execution.",
            },
          },
        },
      },
    }) as { result?: { ok?: boolean; written_views?: string[] } };

    assert.equal(response.result?.ok, true);
    assert.equal(response.result?.written_views?.length, 1);
    assert.equal(store.getView(response.result!.written_views![0])?.view_type, "brief.background_research");
  } finally {
    if (oldRuntime === undefined) delete process.env.PROACTIVE_RESEARCH_AGENT_TASK_RUNTIME;
    else process.env.PROACTIVE_RESEARCH_AGENT_TASK_RUNTIME = oldRuntime;
  }
}));

test("evidence view worker compiles a stored observation without using old runtimeTick", async () => withStore(async (store) => {
  const record = store.insertRecord({
    id: "record:iii-runtime-browser-page",
    schema: { name: "observation.browser_page_snapshot", version: 1 },
    source: { type: "browser", connector: "test" },
    content: { title: "iii runtime migration", text: "Each view compiler is a worker now.", url: "https://example.com/iii-runtime" },
    privacy: { level: "private", retention: "normal" },
  });
  const iii = new InProcessIiiRuntimeClient();
  await registerInfoIiiRuntime(iii, { store });

  const result = await iii.functions.get(VIEW_WORKER_FUNCTIONS.evidence)?.({
    source_record_ids: [record.id],
    write: true,
  });

  assert.equal(result?.ok, true);
  assert.equal(result?.function_id, VIEW_WORKER_FUNCTIONS.evidence);
  assert.equal(result?.view_type, "evidence");
  assert.equal(result?.views_written.length, 1);
  assert.equal(store.getView(result.views_written[0])?.view_type, "evidence");
}));

test("record_ingested cascade runs view workers through iii trigger calls", async () => withStore(async (store) => {
  const record = store.insertRecord({
    id: "record:iii-cascade-browser-page",
    schema: { name: "observation.browser_page_snapshot", version: 1 },
    source: { type: "browser", connector: "test" },
    content: { title: "iii cascade migration", text: "The iii cascade should create downstream views.", url: "https://example.com/iii-cascade" },
    privacy: { level: "private", retention: "normal" },
  });
  const iii = new InProcessIiiRuntimeClient();
  await registerInfoIiiRuntime(iii, { store });

  const result = await iii.functions.get(III_CASCADE_FUNCTIONS.recordIngested)?.({
    record_id: record.id,
    write: true,
    max_depth: 3,
  });

  assert.equal(result?.ok, true);
  assert.equal(result?.mode, "iii_cascade");
  assert.ok(result.steps.some((step: any) => step.function_id === VIEW_WORKER_FUNCTIONS.evidence));
  assert.ok(result.steps.some((step: any) => step.function_id === VIEW_WORKER_FUNCTIONS.activity));
  assert.ok(result.steps.some((step: any) => step.function_id === VIEW_WORKER_FUNCTIONS.proposal));
  assert.ok(store.listViews({ view_types: ["evidence"], active_only: true, limit: 10 }).length >= 1);
  assert.ok(store.listViews({ view_types: ["activity"], active_only: true, limit: 10 }).length >= 1);
}));

test("view_written cascade starts from a source view and routes downstream workers", async () => withStore(async (store) => {
  const record = store.insertRecord({
    id: "record:iii-view-cascade",
    schema: { name: "observation.browser_page_snapshot", version: 1 },
    source: { type: "browser", connector: "test" },
    content: { title: "view cascade", text: "Downstream view workers should run.", url: "https://example.com/view-cascade" },
    privacy: { level: "private", retention: "normal" },
  });
  const iii = new InProcessIiiRuntimeClient();
  await registerInfoIiiRuntime(iii, { store });
  const evidence = await iii.trigger({
    function_id: VIEW_WORKER_FUNCTIONS.evidence,
    payload: { source_record_ids: [record.id], write: true },
  });

  const result = await iii.functions.get(III_CASCADE_FUNCTIONS.viewWritten)?.({
    view_ids: evidence.views_written,
    view_type: "evidence",
    write: true,
    max_depth: 2,
  });

  assert.equal(result?.ok, true);
  assert.ok(result.steps.some((step: any) => step.function_id === VIEW_WORKER_FUNCTIONS.activity));
  assert.ok(result.steps.some((step: any) => step.function_id === VIEW_WORKER_FUNCTIONS.proposal));
  assert.ok(result.views_written.length >= 1);
}));

test("context::ingest stores an observation and cascades through iii runtime", async () => withStore(async (store) => {
  const iii = new InProcessIiiRuntimeClient();
  await registerInfoIiiRuntime(iii, { store });

  const result = await iii.functions.get(III_CONTEXT_FUNCTIONS.ingest)?.({
    record: {
      id: "record:iii-native-ingest",
      schema: { name: "observation.browser_page_snapshot", version: 1 },
      source: { type: "browser", connector: "test" },
      content: { title: "iii native ingest", text: "context::ingest should be the iii-native entrypoint.", url: "https://example.com/native-ingest" },
      privacy: { level: "private", retention: "normal" },
    },
    cascade: true,
    max_depth: 2,
  });

  assert.equal(result?.ok, true);
  assert.equal(result?.function_id, III_CONTEXT_FUNCTIONS.ingest);
  assert.equal(result?.id, "record:iii-native-ingest");
  assert.equal(store.getRecord("record:iii-native-ingest")?.schema.name, "observation.browser_page_snapshot");
  assert.ok(result?.cascade?.steps.some((step: any) => step.function_id === VIEW_WORKER_FUNCTIONS.evidence));
  assert.ok(result?.cascade?.steps.some((step: any) => step.function_id === VIEW_WORKER_FUNCTIONS.activity));
  assert.ok(store.listViews({ view_types: ["evidence"], active_only: true, limit: 10 }).length >= 1);
}));

test("context::ingest uses store dedupe and skips cascade for duplicate snapshots", async () => withStore(async (store) => {
  const iii = new InProcessIiiRuntimeClient();
  await registerInfoIiiRuntime(iii, { store });
  const input = {
    schema: { name: "observation.browser_page_snapshot", version: 1 },
    source: { type: "browser", connector: "test" },
    content: { title: "dedupe", text: "same content", url: "https://example.com/dedupe" },
    payload: { dedupe_window_seconds: 300 },
    privacy: { level: "private", retention: "normal" },
  };

  const first = await iii.functions.get(III_CONTEXT_FUNCTIONS.ingest)?.({ record: input, cascade: false });
  const second = await iii.functions.get(III_CONTEXT_FUNCTIONS.ingest)?.({ record: input, cascade: true });

  assert.equal(first?.deduped, false);
  assert.equal(second?.deduped, true);
  assert.equal(second?.duplicate_of, first?.id);
  assert.equal(second?.cascade, undefined);
}));
