import { ContextStore } from "@info/core";
import type { StoredContextRecord, StoredContextView } from "@info/core";
import { compileEvidenceViews } from "@info/views/evidence/index.js";
import { compileActivityViews } from "@info/views/activity/index.js";
import { compileAudioViews } from "@info/views/audio/index.js";
import { compileVisualFrameViews } from "@info/views/visual-frame/index.js";
import { compileActivityBlockViews } from "@info/views/activity-block/index.js";
import { compileProposalViews } from "@info/views/proposal/index.js";
import { compileResourceViews } from "@info/views/resource/index.js";
import { compileIntentViews, compileIntentViewsWithLlm } from "@info/views/intent/index.js";
import { compileWorkflowViews, compileWorkflowViewsWithLlm } from "@info/views/workflow/index.js";
import { compileMemoryViews, compileMemoryViewsWithLlm } from "@info/views/memory/index.js";
import { compileObservationTimeline } from "@info/views/timeline/timeline.js";
import { compileWorkThreadView } from "@info/views/timeline/work-thread-view.js";
import { compileActivityTimeline } from "@info/views/timeline/activity-timeline.js";
import { compileProjectTimeline } from "@info/views/timeline/project-timeline.js";
import type { ViewWorkerContext, ViewWorkerDefinition, ViewWorkerInput, ViewWorkerResult } from "./types.js";

export const VIEW_WORKER_FUNCTIONS = {
  evidence: "view::evidence_compile",
  activity: "view::activity_compile",
  audio: "view::audio_compile",
  visualFrame: "view::visual_frame_compile",
  activityBlock: "view::activity_block_compile",
  proposal: "view::proposal_compile",
  resource: "view::resource_compile",
  intent: "view::intent_compile",
  workflow: "view::workflow_compile",
  memory: "view::memory_compile",
  workThread: "view::work_thread_compile",
  observationTimeline: "view::timeline_observations_compile",
  activityTimeline: "view::timeline_activity_compile",
  projectTimeline: "view::project_timeline_compile",
} as const;

export function createViewWorkerDefinitions(): ViewWorkerDefinition[] {
  return [
    worker(VIEW_WORKER_FUNCTIONS.evidence, "evidence", ["info.observation.ingested", "info.view.requested"], compileEvidenceWorker),
    worker(VIEW_WORKER_FUNCTIONS.activity, "activity", ["info.view.evidence.written", "info.view.requested"], compileActivityWorker),
    worker(VIEW_WORKER_FUNCTIONS.audio, "audio", ["info.view.evidence.written", "info.view.requested"], compileAudioWorker),
    worker(VIEW_WORKER_FUNCTIONS.visualFrame, "visual_frame", ["info.view.evidence.written", "info.view.requested"], compileVisualFrameWorker),
    worker(VIEW_WORKER_FUNCTIONS.activityBlock, "activity_block", ["info.view.activity.written", "info.view.audio.written", "info.view.visual_frame.written", "info.view.requested"], compileActivityBlockWorker),
    worker(VIEW_WORKER_FUNCTIONS.proposal, "proposal", ["info.view.activity.written", "info.view.activity_block.written", "info.view.requested"], compileProposalWorker),
    worker(VIEW_WORKER_FUNCTIONS.resource, "resource", ["info.view.proposal.written", "info.view.requested"], compileResourceWorker),
    worker(VIEW_WORKER_FUNCTIONS.intent, "intent", ["info.view.proposal.written", "info.view.activity_block.written", "info.view.requested"], compileIntentWorker),
    worker(VIEW_WORKER_FUNCTIONS.workflow, "workflow", ["info.view.intent.written", "info.view.resource.written", "info.view.activity_block.written", "info.view.requested"], compileWorkflowWorker),
    worker(VIEW_WORKER_FUNCTIONS.memory, "memory", ["info.view.workflow.written", "info.view.requested"], compileMemoryWorker),
    worker(VIEW_WORKER_FUNCTIONS.workThread, "work_thread", ["info.observation.ingested", "info.schedule.tick", "info.view.requested"], compileWorkThreadWorker),
    worker(VIEW_WORKER_FUNCTIONS.observationTimeline, "timeline.observations", ["info.observation.ingested", "info.schedule.tick", "info.view.requested"], compileObservationTimelineWorker),
    worker(VIEW_WORKER_FUNCTIONS.activityTimeline, "timeline.activity", ["info.observation.ingested", "info.runtime.event.written", "info.schedule.tick", "info.view.requested"], compileActivityTimelineWorker),
    worker(VIEW_WORKER_FUNCTIONS.projectTimeline, "project_timeline", ["info.view.work_thread.written", "info.schedule.tick", "info.view.requested"], compileProjectTimelineWorker),
  ];
}

async function compileEvidenceWorker(input: ViewWorkerInput, context: ViewWorkerContext) {
  const records = recordsById(context.store, input.source_record_ids);
  const result = compileEvidenceViews({
    minutes: input.minutes ?? 240,
    limit: input.limit ?? 500,
    write: input.write ?? true,
    records: records.length ? records : undefined,
  }, context.store);
  return viewResult(VIEW_WORKER_FUNCTIONS.evidence, "evidence", result.generated_at, storedViews(result.views), {
    compiler_id: result.compiler_id,
    records_scanned: result.records_scanned,
    records_used: result.records_used,
  });
}

async function compileActivityWorker(input: ViewWorkerInput, context: ViewWorkerContext) {
  const evidenceViews = viewsByIdOrType(context.store, input.source_view_ids, ["evidence"], input.limit);
  const result = compileActivityViews({
    minutes: input.minutes ?? 240,
    limit: input.limit ?? 500,
    write: input.write ?? true,
    evidenceViews: evidenceViews.length ? evidenceViews : undefined,
  }, context.store);
  return viewResult(VIEW_WORKER_FUNCTIONS.activity, "activity", result.generated_at, storedViews(result.views), {
    compiler_id: result.compiler_id,
    source_views_used: result.source_views_used,
  });
}

async function compileAudioWorker(input: ViewWorkerInput, context: ViewWorkerContext) {
  const evidenceViews = viewsByIdOrType(context.store, input.source_view_ids, ["evidence"], input.limit);
  const result = await compileAudioViews({
    write: input.write ?? true,
    limit: input.limit,
    llm: input.llm,
    evidenceViews: evidenceViews.length ? evidenceViews : undefined,
  }, context.store);
  return viewResult(VIEW_WORKER_FUNCTIONS.audio, "audio", result.generated_at, storedViews(result.views), {
    compiler_id: result.compiler_id,
    ...result.diagnostics,
  });
}

async function compileVisualFrameWorker(input: ViewWorkerInput, context: ViewWorkerContext) {
  const evidenceViews = viewsByIdOrType(context.store, input.source_view_ids, ["evidence"], input.visual_frame_limit ?? input.limit);
  const result = await compileVisualFrameViews({
    write: input.write ?? true,
    limit: input.visual_frame_limit ?? input.limit,
    concurrency: input.visual_frame_concurrency,
    sampleIntervalSeconds: input.visual_frame_sample_seconds,
    llm: input.vision_llm,
    evidenceViews: evidenceViews.length ? evidenceViews : undefined,
  }, context.store);
  return viewResult(VIEW_WORKER_FUNCTIONS.visualFrame, "visual_frame", result.generated_at, storedViews(result.views), {
    compiler_id: result.compiler_id,
    ...result.diagnostics,
  });
}

async function compileActivityBlockWorker(input: ViewWorkerInput, context: ViewWorkerContext) {
  const sourceViews = viewsById(context.store, input.source_view_ids);
  const result = await compileActivityBlockViews({
    write: input.write ?? true,
    limit: input.limit,
    minutes: input.minutes,
    llm: input.llm,
    visualFrameViews: pickViews(sourceViews, "visual_frame"),
    audioViews: pickViews(sourceViews, "audio"),
    activityViews: pickViews(sourceViews, "activity"),
  }, context.store);
  return viewResult(VIEW_WORKER_FUNCTIONS.activityBlock, "activity_block", result.generated_at, storedViews(result.views), {
    compiler_id: result.compiler_id,
    ...result.diagnostics,
  });
}

async function compileProposalWorker(input: ViewWorkerInput, context: ViewWorkerContext) {
  const activityViews = viewsByIdOrType(context.store, input.source_view_ids, ["activity"], input.limit);
  const result = compileProposalViews({
    write: input.write ?? true,
    limit: input.limit,
    activityViews: activityViews.length ? activityViews : undefined,
  }, context.store);
  return viewResult(VIEW_WORKER_FUNCTIONS.proposal, "proposal", result.generated_at, storedViews(result.views), {
    compiler_id: result.compiler_id,
    source_views_used: result.source_views_used,
  });
}

async function compileResourceWorker(input: ViewWorkerInput, context: ViewWorkerContext) {
  const proposalViews = viewsByIdOrType(context.store, input.source_view_ids, ["proposal"], input.limit);
  const result = compileResourceViews({
    write: input.write ?? true,
    limit: input.limit,
    proposalViews: proposalViews.length ? proposalViews : undefined,
  }, context.store);
  return viewResult(VIEW_WORKER_FUNCTIONS.resource, "resource", result.generated_at, storedViews(result.views), {
    compiler_id: result.compiler_id,
    source_views_used: result.source_views_used,
  });
}

async function compileIntentWorker(input: ViewWorkerInput, context: ViewWorkerContext) {
  const sourceViews = viewsById(context.store, input.source_view_ids);
  const proposalViews = pickViewList(sourceViews, "proposal");
  const activityBlockViews = pickViewList(sourceViews, "activity_block");
  const result = input.llm
    ? await compileIntentViewsWithLlm({
      write: input.write ?? true,
      limit: input.limit,
      proposalViews: proposalViews.length ? proposalViews : undefined,
      activityBlockViews: activityBlockViews.length ? activityBlockViews : undefined,
      llm: input.llm,
    }, context.store)
    : compileIntentViews({
      write: input.write ?? true,
      limit: input.limit,
      proposalViews: proposalViews.length ? proposalViews : undefined,
    }, context.store);
  return viewResult(VIEW_WORKER_FUNCTIONS.intent, "intent", result.generated_at, storedViews(result.views), {
    compiler_id: result.compiler_id,
    source_views_used: "source_views_used" in result ? result.source_views_used : undefined,
    diagnostics: "diagnostics" in result ? result.diagnostics : undefined,
  });
}

async function compileWorkflowWorker(input: ViewWorkerInput, context: ViewWorkerContext) {
  const sourceViews = viewsById(context.store, input.source_view_ids);
  const intentViews = pickViewList(sourceViews, "intent");
  const resourceViews = pickViewList(sourceViews, "resource");
  const activityBlockViews = pickViewList(sourceViews, "activity_block");
  const result = input.llm
    ? await compileWorkflowViewsWithLlm({
      write: input.write ?? true,
      limit: input.limit,
      intentViews: intentViews.length ? intentViews : undefined,
      resourceViews: resourceViews.length ? resourceViews : undefined,
      activityBlockViews: activityBlockViews.length ? activityBlockViews : undefined,
      llm: input.llm,
    }, context.store)
    : compileWorkflowViews({
      write: input.write ?? true,
      limit: input.limit,
      intentViews: intentViews.length ? intentViews : undefined,
      resourceViews: resourceViews.length ? resourceViews : undefined,
    }, context.store);
  return viewResult(VIEW_WORKER_FUNCTIONS.workflow, "workflow", result.generated_at, storedViews(result.views), {
    compiler_id: result.compiler_id,
    source_views_used: "source_views_used" in result ? result.source_views_used : undefined,
    diagnostics: "diagnostics" in result ? result.diagnostics : undefined,
  });
}

async function compileMemoryWorker(input: ViewWorkerInput, context: ViewWorkerContext) {
  const workflowViews = viewsByIdOrType(context.store, input.source_view_ids, ["workflow"], input.limit);
  const result = input.llm
    ? await compileMemoryViewsWithLlm({
      write: input.write ?? true,
      limit: input.limit,
      workflowViews: workflowViews.length ? workflowViews : undefined,
      llm: input.llm,
    }, context.store)
    : compileMemoryViews({
      write: input.write ?? true,
      limit: input.limit,
      workflowViews: workflowViews.length ? workflowViews : undefined,
    }, context.store);
  return viewResult(VIEW_WORKER_FUNCTIONS.memory, "memory", result.generated_at, storedViews(result.views), {
    compiler_id: result.compiler_id,
    source_views_used: "source_views_used" in result ? result.source_views_used : undefined,
    diagnostics: "diagnostics" in result ? result.diagnostics : undefined,
  });
}

async function compileWorkThreadWorker(input: ViewWorkerInput, context: ViewWorkerContext) {
  const result = compileWorkThreadView({
    minutes: input.work_thread_minutes ?? input.minutes ?? 180,
    limit: input.limit ?? 180,
    write: input.write ?? true,
  }, context.store);
  return viewResult(VIEW_WORKER_FUNCTIONS.workThread, "work_thread", result.generated_at, storedViews([result.view]), {
    compiler_id: result.compiler_id,
    records_scanned: result.records_scanned,
    records_used: result.records_used,
    candidate_threads: result.candidate_threads.length,
    active_thread_id: result.active_thread?.thread_id,
  });
}

async function compileObservationTimelineWorker(input: ViewWorkerInput, context: ViewWorkerContext) {
  const result = compileObservationTimeline({
    minutes: input.minutes ?? 24 * 60,
    limit: input.limit ?? 200,
    write: input.write ?? true,
    records: input.records ?? (input.source_record_ids?.length ? recordsById(context.store, input.source_record_ids) : undefined),
    pluginId: input.plugin_id,
  }, context.store);
  return viewResult(VIEW_WORKER_FUNCTIONS.observationTimeline, "timeline.observations", new Date().toISOString(), storedViews([result.view]), {
    records_used: result.records_used,
    buckets: result.buckets.length,
  });
}

async function compileActivityTimelineWorker(input: ViewWorkerInput, context: ViewWorkerContext) {
  const result = compileActivityTimeline({
    minutes: input.activity_timeline_minutes ?? input.minutes ?? 240,
    limit: input.limit ?? 400,
    eventLimit: input.event_limit ?? 120,
    bucketMinutes: input.bucket_minutes,
    write: input.write ?? true,
    includeRuntimeEvents: input.include_runtime_events,
    includeLowLevelScreenpipe: input.include_low_level_screenpipe,
    dedupe: input.dedupe,
    bucketItemLimit: input.bucket_item_limit,
    summarizeHeartbeats: input.summarize_heartbeats,
    sourceFilter: input.source_filter,
    mergeContinuous: input.merge_continuous,
    mergeGapMinutes: input.merge_gap_minutes,
    records: input.records,
    runtimeEvents: input.runtime_events,
    pluginId: input.plugin_id,
  }, context.store);
  return viewResult(VIEW_WORKER_FUNCTIONS.activityTimeline, "timeline.activity", new Date().toISOString(), storedViews([result.view]), {
    compiler_id: result.compiler_id,
    records_used: result.records_used,
    events_used: result.events_used,
    buckets: result.buckets.length,
  });
}

async function compileProjectTimelineWorker(input: ViewWorkerInput, context: ViewWorkerContext) {
  const result = compileProjectTimeline({
    projectPath: input.project_path,
    project: input.project,
    minutes: input.project_timeline_minutes ?? input.minutes ?? 2 * 24 * 60,
    limit: input.limit ?? 500,
    eventLimit: input.event_limit ?? 120,
    bucketMinutes: input.bucket_minutes,
    write: input.write ?? true,
    records: input.records,
    runtimeEvents: input.runtime_events,
    workThreadViews: input.source_views,
    includeStoredWorkThreads: input.source_views ? false : undefined,
    pluginId: input.plugin_id,
  }, context.store);
  return viewResult(VIEW_WORKER_FUNCTIONS.projectTimeline, "project_timeline", new Date().toISOString(), storedViews([result.view]), {
    compiler_id: result.compiler_id,
    project: result.project,
    project_path: input.project_path,
    records_used: result.records_used,
    buckets: result.buckets.length,
    work_threads: result.work_threads.length,
  });
}

function worker(
  functionId: string,
  viewType: string,
  inputTopics: string[],
  handler: ViewWorkerDefinition["handler"],
): ViewWorkerDefinition {
  return {
    function_id: functionId,
    view_type: viewType,
    input_topics: inputTopics,
    output_topic: `info.view.${viewType}.written`,
    handler,
  };
}

function viewResult(
  functionId: string,
  viewType: string,
  generatedAt: string,
  views: StoredContextView[],
  diagnostics: Record<string, unknown>,
): ViewWorkerResult {
  return {
    ok: true,
    function_id: functionId,
    view_type: viewType,
    generated_at: generatedAt,
    views_written: views.map(view => view.id),
    views,
    diagnostics,
  };
}

function recordsById(store: ContextStore, ids: string[] | undefined): StoredContextRecord[] {
  return (ids ?? []).map(id => store.getRecord(id)).filter((record): record is StoredContextRecord => Boolean(record));
}

function viewsById(store: ContextStore, ids: string[] | undefined): StoredContextView[] {
  return (ids ?? []).map(id => store.getView(id)).filter((view): view is StoredContextView => Boolean(view));
}

function viewsByIdOrType(store: ContextStore, ids: string[] | undefined, viewTypes: string[], limit = 100): StoredContextView[] {
  const byId = viewsById(store, ids).filter(view => viewTypes.includes(view.view_type));
  if (byId.length) return byId;
  return store.listViews({ view_types: viewTypes, active_only: true, limit });
}

function pickViews(views: StoredContextView[], viewType: string): StoredContextView[] | undefined {
  const selected = views.filter(view => view.view_type === viewType);
  return selected.length ? selected : undefined;
}

function pickViewList(views: StoredContextView[], viewType: string): StoredContextView[] {
  return views.filter(view => view.view_type === viewType);
}

function storedViews(views: Array<{ id?: string }>): StoredContextView[] {
  return views.filter((view): view is StoredContextView => typeof view.id === "string" && Boolean(view.id));
}
