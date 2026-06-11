import type { ContextStore, LlmOptions, StoredContextRecord, StoredContextView, StoredRuntimeEvent } from "@info/core";

export type IiiRuntimeClient = {
  registerFunction(id: string, handler: (input: unknown) => Promise<any>, options?: unknown): unknown | Promise<unknown>;
  registerTrigger?(trigger: { type: string; function_id: string; config: Record<string, unknown>; metadata?: Record<string, unknown> }): unknown | Promise<unknown>;
  trigger?(input: { function_id: string; payload?: unknown; action?: unknown }): Promise<unknown> | unknown;
};

export type InfoIiiRuntimeOptions = {
  store?: ContextStore;
  engineUrl?: string;
  workerName?: string;
};

export type ViewWorkerInput = {
  write?: boolean;
  minutes?: number;
  limit?: number;
  llm?: LlmOptions;
  vision_llm?: LlmOptions;
  visual_frame_limit?: number;
  visual_frame_concurrency?: number;
  visual_frame_sample_seconds?: number;
  work_thread_minutes?: number;
  activity_timeline_minutes?: number;
  project_timeline_minutes?: number;
  project_path?: string;
  project?: string;
  plugin_id?: string;
  source_record_ids?: string[];
  source_view_ids?: string[];
  records?: StoredContextRecord[];
  runtime_events?: StoredRuntimeEvent[];
  source_views?: StoredContextView[];
  event_limit?: number;
  bucket_minutes?: number;
  include_runtime_events?: boolean;
  include_low_level_screenpipe?: boolean;
  dedupe?: boolean;
  bucket_item_limit?: number | false;
  summarize_heartbeats?: boolean;
  source_filter?: "screenpipe" | "browser" | "runtime" | "all";
  merge_continuous?: boolean;
  merge_gap_minutes?: number;
  cascade?: boolean;
  cascade_depth?: number;
  max_depth?: number;
};

export type ViewWorkerResult = {
  ok: true;
  function_id: string;
  view_type: string;
  generated_at: string;
  views_written: string[];
  views: StoredContextView[];
  diagnostics: Record<string, unknown>;
};

export type ViewWorkerContext = {
  store: ContextStore;
  iii?: IiiRuntimeClient;
};

export type ViewWorkerDefinition = {
  function_id: string;
  view_type: string;
  input_topics: string[];
  output_topic: string;
  handler: (input: ViewWorkerInput, context: ViewWorkerContext) => Promise<ViewWorkerResult>;
};

export type ViewDependencySpec = {
  function_id: string;
  view_type: string;
  depends_on: string[];
  source_records?: StoredContextRecord[];
  source_views?: StoredContextView[];
};

export type IiiCascadeInput = ViewWorkerInput & {
  record_id?: string;
  record_ids?: string[];
  view_id?: string;
  view_ids?: string[];
  view_type?: string;
};

export type IiiCascadeStep = {
  function_id: string;
  view_type: string;
  depth: number;
  input: ViewWorkerInput;
  result?: ViewWorkerResult;
  raw_result?: unknown;
  skipped?: string;
};

export type IiiCascadeResult = {
  ok: true;
  mode: "iii_cascade";
  generated_at: string;
  root_records: string[];
  root_views: string[];
  steps: IiiCascadeStep[];
  views_written: string[];
};
