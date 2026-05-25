import { execFileSync } from "node:child_process";
import type { ContextRecord, ContextView, StoredContextRecord, StoredContextView } from "../../core/types.js";
import type { Capability, CapabilityRunResult, ContextSignal } from "../types.js";

export type AgentTaskPayload = {
  runtime?: string;
  goal?: string;
  context_pack?: { markdown?: string; sources?: unknown[]; diagnostics?: Record<string, unknown> };
  output_contract?: {
    view_type?: string;
    title?: string;
    purpose?: string;
  };
  constraints?: Record<string, unknown>;
};

export const agentTaskSubmitCapability: Capability = {
  id: "capability.agent_task.submit",
  title: "Submit Agent Task",
  purpose: "Submit a generic agent task to an agent runtime adapter and write the structured result back as Views.",
  version: "0.1.0",
  mode: "agent",
  default_speed: "work",
  default_autonomy: "suggest",
  produces: ["agent_task.result", "view.from_agent_task"],

  run({ signal, store, payload, program, dry_run }): CapabilityRunResult {
    const task = normalizeTask(payload?.task);
    if (agentTaskHasCallerSelectedSkills(payload?.task)) return { ok: false, reason: "agent task must not include skills or tools; external runtime owns them" };
    if (!task.goal) return { ok: false, reason: "agent task missing goal" };
    const viewType = task.output_contract?.view_type;
    if (!viewType) return { ok: false, reason: "agent task output_contract.view_type is required" };
    const viewTypeError = validateAgentTaskViewType(viewType);
    if (viewTypeError) return { ok: false, reason: viewTypeError, diagnostics: { output_view_type: viewType } };
    const runtime = task.runtime ?? defaultAgentTaskRuntime();
    if (runtime === "claude_code") return runClaudeCodeAgentTask({ task, signal, store, requestedByProgram: program?.id, dryRun: Boolean(dry_run) });
    if (runtime !== "local_mock") return { ok: false, reason: `agent runtime adapter not available: ${runtime}`, diagnostics: { runtime } };

    const object = loadSignalObject(signal, store);
    const provenance = agentTaskProvenance(task, signal, store);
    const view = buildLocalMockView({
      task,
      signal,
      object,
      provenance,
      store,
      compilerId: "capability.agent_task.submit",
      requestedByProgram: program?.id,
    });
    return {
      ok: true,
      reason: `submitted agent task to ${runtime} and received ${view.view_type}`,
      views: [view],
      events: [
        {
          event_type: "agent_task.submitted",
          actor: "system",
          status: "started",
          subject_type: "plugin",
          subject_id: "capability.agent_task.submit",
          plugin_id: "capability.agent_task.submit",
          related_records: provenance.source_records,
          related_views: provenance.source_views,
          payload: {
            runtime,
            goal: task.goal,
            output_contract: task.output_contract,
            constraints: task.constraints,
            requested_by_program: program?.id,
          },
        },
        {
          event_type: "agent_task.completed",
          actor: "agent",
          status: "completed",
          subject_type: "plugin",
          subject_id: "capability.agent_task.submit",
          plugin_id: "capability.agent_task.submit",
          related_records: provenance.source_records,
          related_views: [...provenance.source_views, view.id!],
          payload: {
            runtime,
            goal: task.goal,
            output_view_id: view.id,
            output_view_type: view.view_type,
            output_contract: task.output_contract,
            requested_by_program: program?.id,
          },
        },
      ],
      diagnostics: {
        runtime,
        output_view_type: view.view_type,
        output_view_id: view.id,
        task_goal: task.goal,
        context_source_count: provenanceCount(provenance),
      },
    };
  },
};

function runClaudeCodeAgentTask(input: {
  task: AgentTaskPayload;
  signal: ContextSignal;
  store: { getRecord(id: string): StoredContextRecord | undefined; getView(id: string): StoredContextView | undefined };
  requestedByProgram?: string;
  dryRun?: boolean;
}): CapabilityRunResult {
  const { task, signal, store, requestedByProgram, dryRun } = input;
  const runtime = "claude_code";
  const provenance = agentTaskProvenance(task, signal, store);
  const prompt = buildClaudeCodePrompt(task, signal, provenance);
  const toolPolicy = claudeCodeToolPolicy(task);
  if (dryRun) {
    return {
      ok: true,
      reason: "dry_run previewed Claude Code agent task",
      diagnostics: {
        runtime,
        dry_run: true,
        prompt_preview: prompt.slice(0, 4000),
        task_goal: task.goal,
        output_view_type: task.output_contract?.view_type,
        context_source_count: provenanceCount(provenance),
        tool_policy: toolPolicy,
      },
    };
  }
  const privacyDenial = agentTaskPrivacyDenial(runtime, signal, provenance, store);
  if (privacyDenial) {
    return {
      ok: false,
      reason: privacyDenial.reason,
      diagnostics: {
        runtime,
        policy_denied: true,
        policy: privacyDenial.policy,
        related_records: privacyDenial.related_records,
        related_views: privacyDenial.related_views,
        task_goal: task.goal,
        context_source_count: provenanceCount(provenance),
      },
    };
  }

  const submitted = agentTaskSubmittedEvent(task, provenance, runtime, requestedByProgram);
  try {
    const output = runClaudeCode(prompt, task);
    const object = loadSignalObject(signal, store);
    const view = buildAgentOutputView({
      task,
      signal,
      object,
      output,
      provenance,
      store,
      compilerId: "capability.agent_task.submit",
      requestedByProgram,
      runtime,
    });
    return {
      ok: true,
      reason: `submitted agent task to ${runtime} and received ${view.view_type}`,
      views: [view],
      events: [
        submitted,
        {
          event_type: "agent_task.completed",
          actor: "agent",
          status: "completed",
          subject_type: "plugin",
          subject_id: "capability.agent_task.submit",
          plugin_id: "capability.agent_task.submit",
          related_records: provenance.source_records,
          related_views: [...provenance.source_views, view.id!],
          payload: { runtime, goal: task.goal, output_view_id: view.id, output_view_type: view.view_type, output_contract: task.output_contract, requested_by_program: requestedByProgram },
        },
      ],
      diagnostics: {
        runtime,
        output_view_type: view.view_type,
        output_view_id: view.id,
        task_goal: task.goal,
        context_source_count: provenanceCount(provenance),
      },
    };
  } catch (error) {
    const reason = `Claude Code agent task failed: ${errorMessage(error)}`;
    return {
      ok: false,
      reason,
      events: [
        submitted,
        {
          event_type: "agent_task.failed",
          actor: "agent",
          status: "failed",
          subject_type: "plugin",
          subject_id: "capability.agent_task.submit",
          plugin_id: "capability.agent_task.submit",
          related_records: provenance.source_records,
          related_views: provenance.source_views,
          payload: { runtime, goal: task.goal, reason, requested_by_program: requestedByProgram },
        },
      ],
      diagnostics: { runtime, error: reason, task_goal: task.goal, context_source_count: provenanceCount(provenance) },
    };
  }
}

function buildLocalMockView(input: {
  task: AgentTaskPayload;
  signal: ContextSignal;
  object?: StoredContextRecord | StoredContextView;
  provenance: AgentTaskProvenance;
  store: { getRecord(id: string): StoredContextRecord | undefined; getView(id: string): StoredContextView | undefined };
  compilerId: string;
  requestedByProgram?: string;
}): ContextView {
  const { task, signal, object, provenance, store, compilerId, requestedByProgram } = input;
  const title = task.output_contract?.title ?? `Agent task result: ${signal.title ?? signal.object_id}`;
  const summary = summarize(task, signal, object);
  return {
    id: `${task.output_contract?.view_type}:${stableKey(`${task.runtime ?? "local_mock"}:${task.goal}:${signal.object_id}`)}`,
    view_type: task.output_contract?.view_type ?? "analysis.agent_task",
    title: title.slice(0, 180),
    summary,
    status: "candidate",
    source_records: provenance.source_records,
    source_views: provenance.source_views,
    compiler: { id: compilerId, version: "0.1.0", mode: "hybrid" },
    purpose: task.output_contract?.purpose ?? "Structured View produced by a generic external agent task adapter.",
    scope: {
      domain: signal.domain,
      project: signal.project,
      project_path: signal.project_path,
      repo: signal.repo,
      app: signal.app,
      plugin_id: requestedByProgram ?? compilerId,
    },
    content: {
      summary,
      key_points: keyPoints(task, signal),
      agent_task: {
        runtime: task.runtime ?? "local_mock",
        goal: task.goal,
        output_contract: task.output_contract,
        constraints: task.constraints,
      },
      agent_output: {
        summary,
        key_points: keyPoints(task, signal),
        confidence: 0.5,
        output_contract: task.output_contract,
      },
      context_pack_markdown_excerpt: task.context_pack?.markdown?.slice(0, 1200),
    },
    confidence: 0.5,
    stability: "session",
    lossiness: "medium",
    privacy: mergedPrivacy(provenance, store) ?? (object && "privacy" in object ? object.privacy : undefined),
    metadata: {
      agent_runtime: task.runtime ?? "local_mock",
      requested_by_program: requestedByProgram,
      source_object_type: signal.object_type,
      source_object_kind: signal.object_kind,
    },
  };
}

function buildAgentOutputView(input: {
  task: AgentTaskPayload;
  signal: ContextSignal;
  object?: StoredContextRecord | StoredContextView;
  output: AgentTaskOutput;
  provenance: AgentTaskProvenance;
  store: { getRecord(id: string): StoredContextRecord | undefined; getView(id: string): StoredContextView | undefined };
  compilerId: string;
  requestedByProgram?: string;
  runtime: string;
}): ContextView {
  const { task, signal, object, output, provenance, store, compilerId, requestedByProgram, runtime } = input;
  const summary = output.summary || summarize(task, signal, object);
  return {
    id: `${task.output_contract?.view_type}:${stableKey(`${runtime}:${task.goal}:${signal.object_id}`)}`,
    view_type: task.output_contract?.view_type ?? "analysis.agent_task",
    title: (task.output_contract?.title ?? `Agent task result: ${signal.title ?? signal.object_id}`).slice(0, 180),
    summary,
    status: "candidate",
    source_records: provenance.source_records,
    source_views: provenance.source_views,
    compiler: { id: compilerId, version: "0.1.0", mode: "hybrid" },
    purpose: task.output_contract?.purpose ?? "Structured View produced by a generic external agent task adapter.",
    scope: {
      domain: signal.domain,
      project: signal.project,
      project_path: signal.project_path,
      repo: signal.repo,
      app: signal.app,
      plugin_id: requestedByProgram ?? compilerId,
    },
    content: {
      summary,
      analysis: output.analysis,
      key_points: output.key_points,
      agent_task: {
        runtime,
        goal: task.goal,
        output_contract: task.output_contract,
        constraints: task.constraints,
      },
      agent_output: {
        summary,
        analysis: output.analysis,
        key_points: output.key_points,
        confidence: output.confidence ?? 0.5,
        output_contract: task.output_contract,
      },
      context_pack_markdown_excerpt: task.context_pack?.markdown?.slice(0, 1200),
    },
    confidence: output.confidence ?? 0.5,
    stability: "session",
    lossiness: "medium",
    privacy: mergedPrivacy(provenance, store) ?? (object && "privacy" in object ? object.privacy : undefined),
    metadata: {
      agent_runtime: runtime,
      requested_by_program: requestedByProgram,
      source_object_type: signal.object_type,
      source_object_kind: signal.object_kind,
    },
  };
}

type AgentTaskOutput = {
  summary: string;
  analysis?: string;
  key_points?: string[];
  confidence?: number;
};

function buildClaudeCodePrompt(task: AgentTaskPayload, signal: ContextSignal, provenance: AgentTaskProvenance): string {
  return [
    "You are a local agent runtime adapter for Info, a local-first ambient context runtime.",
    "Use the provided task and Context Pack as primary inputs.",
    "You own your runtime tools and skills; Info only provides the task boundary, context, constraints, and output contract.",
    "Follow the task constraints exactly.",
    "This adapter produces analysis-only Views. Do not return next_actions, tasks, tool plans, file diffs, or diffs.",
    "Return only JSON matching this shape:",
    JSON.stringify({
      summary: "string",
      analysis: "string",
      key_points: ["string"],
      confidence: 0.5,
    }, null, 2),
    "",
    "AGENT TASK:",
    JSON.stringify({
      runtime: task.runtime ?? "claude_code",
      goal: task.goal,
      constraints: task.constraints,
      output_contract: task.output_contract,
      signal,
    }, null, 2),
    "",
    "CONTEXT SOURCES:",
    JSON.stringify(contextSourcesForPrompt(task, provenance), null, 2),
    "",
    "CONTEXT PACK:",
    task.context_pack?.markdown ?? "",
  ].join("\n");
}

function contextSourcesForPrompt(task: AgentTaskPayload, provenance: AgentTaskProvenance): unknown[] {
  const sources: Array<{ id: string; kind: "record" | "view"; uri: string }> = [];
  for (const id of provenance.source_records) {
    sources.push({ id, kind: "record", uri: `context://records/${id}` });
  }
  for (const id of provenance.source_views) {
    sources.push({ id, kind: "view", uri: `context://views/${id}` });
  }
  return sources.slice(0, 40);
}

function runClaudeCode(prompt: string, task?: AgentTaskPayload): AgentTaskOutput {
  const bin = process.env.CLAUDE_CODE_BIN || "claude";
  // Do not impose a default wall-clock timeout: local agent runtimes may be
  // actively using their own tools/skills for slow read-only enrichment.
  // Operators can still set AGENT_TASK_CLAUDE_CODE_TIMEOUT_MS as an explicit
  // safety cutoff for deployments that need one.
  const timeoutMs = Number(process.env.AGENT_TASK_CLAUDE_CODE_TIMEOUT_MS ?? 0);
  const stdout = execFileSync(bin, claudeCodeArgs(prompt, task), {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 2 * 1024 * 1024,
    cwd: process.cwd(),
    env: { ...process.env, CLAUDE_CODE_SIMPLE: "1" },
  });
  return parseAgentTaskOutput(stdout);
}

function claudeCodeArgs(prompt: string, task?: AgentTaskPayload): string[] {
  const toolPolicy = claudeCodeToolPolicy(task);
  const args = [
    "-p",
    "--no-session-persistence",
    "--dangerously-skip-permissions",
    `--tools=${toolPolicy.tools}`,
    "--output-format=json",
  ];
  args.push(prompt);
  return args;
}

function claudeCodeToolPolicy(task?: AgentTaskPayload) {
  void task;
  return {
    tools: "default",
    permission_mode: "dangerously-skip-permissions",
    allowed_tools: [],
    disallowed_tools: [],
    reason: "local experiment trusts Claude Code as the external agent runtime with full tool permissions; task prompt still carries behavioral constraints",
  };
}

function parseAgentTaskOutput(stdout: string): AgentTaskOutput {
  const parsed = JSON.parse(stdout) as any;
  if (parsed?.is_error || /API Error:/i.test(String(parsed?.result ?? ""))) throw new Error(String(parsed?.result ?? "Claude Code returned an error"));
  const candidate = typeof parsed?.result === "string" ? JSON.parse(stripJsonCodeFence(parsed.result)) : parsed;
  if (!candidate || typeof candidate !== "object") throw new Error("Claude Code returned non-object agent output");
  const unsupportedField = ["next_actions", "tasks", "tool_plans", "file_diffs", "diffs"].find(field => Object.hasOwn(candidate, field));
  if (unsupportedField) throw new Error(`unsupported agent output field: ${unsupportedField}`);
  if (typeof candidate.summary !== "string" || !candidate.summary.trim()) throw new Error("Claude Code agent output missing non-empty summary");
  return {
    summary: candidate.summary.trim(),
    analysis: candidate.analysis === undefined ? undefined : String(candidate.analysis),
    key_points: Array.isArray(candidate.key_points) ? candidate.key_points.map(String).slice(0, 12) : undefined,
    confidence: typeof candidate.confidence === "number" ? Math.max(0, Math.min(1, candidate.confidence)) : 0.5,
  };
}

function stripJsonCodeFence(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

type AgentTaskProvenance = {
  source_records: string[];
  source_views: string[];
};

function agentTaskSubmittedEvent(task: AgentTaskPayload, provenance: AgentTaskProvenance, runtime: string, requestedByProgram?: string) {
  return {
    event_type: "agent_task.submitted",
    actor: "system" as const,
    status: "started" as const,
    subject_type: "plugin" as const,
    subject_id: "capability.agent_task.submit",
    plugin_id: "capability.agent_task.submit",
    related_records: provenance.source_records,
    related_views: provenance.source_views,
    payload: {
      runtime,
      goal: task.goal,
      output_contract: task.output_contract,
      constraints: task.constraints,
      requested_by_program: requestedByProgram,
    },
  };
}

function agentTaskProvenance(task: AgentTaskPayload, signal: ContextSignal, store: { getRecord(id: string): StoredContextRecord | undefined; getView(id: string): StoredContextView | undefined }): AgentTaskProvenance {
  const sourceRecords = signal.object_kind === "observation" ? [signal.object_id] : signal.source_records ?? [];
  const sourceViews = signal.object_kind === "view" ? [signal.object_id] : signal.source_views ?? [];
  for (const source of task.context_pack?.sources ?? []) {
    if (!source || typeof source !== "object") continue;
    const id = typeof (source as { id?: unknown }).id === "string" ? (source as { id: string }).id : undefined;
    const kind = (source as { kind?: unknown }).kind;
    if (!id) continue;
    if (kind === "record" && store.getRecord(id)) sourceRecords.push(id);
    if (kind === "view" && store.getView(id)) sourceViews.push(id);
  }
  return {
    source_records: unique(sourceRecords),
    source_views: unique(sourceViews),
  };
}

function agentTaskPrivacyDenial(
  runtime: string,
  signal: ContextSignal,
  provenance: AgentTaskProvenance,
  store: { getRecord(id: string): StoredContextRecord | undefined; getView(id: string): StoredContextView | undefined },
): { reason: string; policy: string; related_records: string[]; related_views: string[] } | undefined {
  if (runtime !== "claude_code") return undefined;
  const sources = agentTaskPrivacySources(provenance, store);
  if (!sources.records.some(record => record.privacy?.allow_external_llm === false) && !sources.views.some(view => view.privacy?.allow_external_llm === false)) return undefined;
  return {
    reason: `privacy denied: agent task for ${signal.object_kind} ${signal.object_id} includes provenance that disallows external LLM use`,
    policy: "privacy.external_llm",
    related_records: sources.records.map(record => record.id),
    related_views: sources.views.map(view => view.id),
  };
}

function agentTaskPrivacySources(
  provenance: AgentTaskProvenance,
  store: { getRecord(id: string): StoredContextRecord | undefined; getView(id: string): StoredContextView | undefined },
): { records: StoredContextRecord[]; views: StoredContextView[] } {
  const records = new Map<string, StoredContextRecord>();
  const views = new Map<string, StoredContextView>();
  for (const id of provenance.source_records) {
    const record = store.getRecord(id);
    if (record) records.set(record.id, record);
  }
  for (const id of provenance.source_views) collectAgentTaskViewSources(id, store, records, views, 0);
  return { records: [...records.values()], views: [...views.values()] };
}

function collectAgentTaskViewSources(
  viewId: string,
  store: { getRecord(id: string): StoredContextRecord | undefined; getView(id: string): StoredContextView | undefined },
  records: Map<string, StoredContextRecord>,
  views: Map<string, StoredContextView>,
  depth: number,
): void {
  if (depth > 3 || views.has(viewId)) return;
  const view = store.getView(viewId);
  if (!view) return;
  views.set(view.id, view);
  for (const id of view.source_records ?? []) {
    const record = store.getRecord(id);
    if (record) records.set(record.id, record);
  }
  for (const id of view.source_views ?? []) collectAgentTaskViewSources(id, store, records, views, depth + 1);
}


function agentTaskHasCallerSelectedSkills(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && (Object.hasOwn(value, "skills") || Object.hasOwn(value, "tools")));
}

function normalizeTask(value: unknown): AgentTaskPayload {
  return value && typeof value === "object" ? value as AgentTaskPayload : {};
}

function validateAgentTaskViewType(viewType: string): string | undefined {
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(viewType)) return `agent task output_contract.view_type is invalid: ${viewType}`;
  if (/^(observation|feedback|episode|derived)\./.test(viewType)) return `agent task output_contract.view_type must be a View type, not ${viewType}`;
  return undefined;
}

function defaultAgentTaskRuntime(): string {
  return process.env.AGENT_TASK_DEFAULT_RUNTIME || "claude_code";
}

function loadSignalObject(signal: ContextSignal, store: { getRecord(id: string): StoredContextRecord | undefined; getView(id: string): StoredContextView | undefined }): StoredContextRecord | StoredContextView | undefined {
  return signal.object_kind === "observation" ? store.getRecord(signal.object_id) : store.getView(signal.object_id);
}

function summarize(task: AgentTaskPayload, signal: ContextSignal, object?: StoredContextRecord | StoredContextView): string {
  const text = signal.text_preview ?? objectText(object);
  const base = text ? firstSentence(text, 220) : `Agent task completed for ${signal.object_type}.`;
  return `${base} Goal: ${task.goal}`.slice(0, 360);
}

function keyPoints(task: AgentTaskPayload, signal: ContextSignal): string[] {
  return [
    `Agent runtime: ${task.runtime ?? "local_mock"}`,
    `Input object: ${signal.object_type}`,
    `Output View type: ${task.output_contract?.view_type}`,
    ...(signal.url ? [`URL: ${signal.url}`] : []),
  ].filter((item): item is string => Boolean(item));
}

function objectText(object?: StoredContextRecord | StoredContextView): string | undefined {
  if (!object) return undefined;
  if ("view_type" in object) return object.summary ?? stringValue(object.content?.analysis);
  return object.content?.text ?? object.content?.title;
}

function firstSentence(text: string, max: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  const sentence = normalized.split(/(?<=[.!?。！？])\s+/)[0] || normalized;
  return sentence.slice(0, max);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function provenanceCount(provenance: AgentTaskProvenance): number {
  return provenance.source_records.length + provenance.source_views.length;
}

type Privacy = ContextRecord["privacy"];

function mergedPrivacy(provenance: AgentTaskProvenance, store: { getRecord(id: string): StoredContextRecord | undefined; getView(id: string): StoredContextView | undefined }): Privacy | undefined {
  const values: NonNullable<Privacy>[] = [];
  for (const id of provenance.source_records) {
    const privacy = store.getRecord(id)?.privacy;
    if (privacy) values.push(privacy);
  }
  for (const id of provenance.source_views) collectViewPrivacy(id, store, values, new Set(), 0);
  if (!values.length) return undefined;
  return {
    level: maxByRank(values.map(value => value.level), { public: 0, workspace: 1, private: 2, secret: 3 }),
    retention: maxByRank(values.map(value => value.retention), { ephemeral: 0, normal: 1, archive: 2, do_not_store: 3 }),
    allow_embedding: mergedBoolean(values.map(value => value.allow_embedding)),
    allow_llm_summary: mergedBoolean(values.map(value => value.allow_llm_summary)),
    allow_external_llm: mergedBoolean(values.map(value => value.allow_external_llm)),
    allow_external_reader: mergedBoolean(values.map(value => value.allow_external_reader)),
  };
}

function collectViewPrivacy(viewId: string, store: { getRecord(id: string): StoredContextRecord | undefined; getView(id: string): StoredContextView | undefined }, values: NonNullable<Privacy>[], seen: Set<string>, depth: number): void {
  if (depth > 3 || seen.has(viewId)) return;
  seen.add(viewId);
  const view = store.getView(viewId);
  if (!view) return;
  if (view.privacy) values.push(view.privacy);
  for (const id of view.source_records ?? []) {
    const privacy = store.getRecord(id)?.privacy;
    if (privacy) values.push(privacy);
  }
  for (const id of view.source_views ?? []) collectViewPrivacy(id, store, values, seen, depth + 1);
}

function maxByRank<T extends string>(values: Array<T | undefined>, rank: Record<T, number>): T | undefined {
  return values.filter((value): value is T => Boolean(value)).sort((a, b) => rank[b] - rank[a])[0];
}

function mergedBoolean(values: Array<boolean | undefined>): boolean | undefined {
  if (values.some(value => value === false)) return false;
  if (values.some(value => value === true)) return true;
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stableKey(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
