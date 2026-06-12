import { createHash } from "node:crypto";
import type { ContextRecord, ContextStore, ContextView, StoredContextView } from "@info/core";
import type { ProcessorDefinition, ViewDraft, WriteViewDraftContext } from "./types.js";

export function writeViewDrafts(
  store: ContextStore,
  drafts: ViewDraft[] = [],
  context: WriteViewDraftContext,
): StoredContextView[] {
  return drafts.map((draft, index) => {
    const view = normalizeViewDraft(draft, context, index);
    const stored = store.upsertView(view);
    store.appendRuntimeEvent({
      event_type: "processor.view_written",
      actor: "system",
      status: "completed",
      subject_type: "view",
      subject_id: stored.id,
      plugin_id: context.processor.id,
      related_records: stored.source_records,
      related_views: stored.source_views,
      payload: {
        processor_id: context.processor.id,
        view_type: stored.view_type,
        runtime: context.processor.runtime.kind,
      },
    });
    return stored;
  });
}

function normalizeViewDraft(
  draft: ViewDraft,
  context: WriteViewDraftContext,
  index: number,
): ContextView {
  const sourceRecords = unique([...(context.source_record_ids ?? []), ...(draft.source_records ?? [])]);
  const sourceViews = unique([...(context.source_view_ids ?? []), ...(draft.source_views ?? [])]);
  const compilerMode = compilerModeFor(context.processor);
  const id = draft.id ?? draftId(context.processor, draft, sourceRecords, sourceViews, index);
  const scope = draft.scope ?? inheritedScope(context.processor, draft);
  const privacy = draft.privacy ?? inheritedPrivacy(context.processor, draft);

  return {
    ...draft,
    id,
    view_type: draft.type,
    source_records: sourceRecords,
    source_views: sourceViews,
    compiler: {
      id: context.processor.id,
      version: context.processor.version,
      mode: compilerMode,
      ...draft.compiler,
    },
    scope,
    privacy,
    metadata: {
      ...(draft.metadata ?? {}),
      processor_runtime: context.processor.runtime.kind,
    },
  };
}

function draftId(
  processor: ProcessorDefinition,
  draft: ViewDraft,
  sourceRecords: string[],
  sourceViews: string[],
  index: number,
): string {
  const hash = createHash("sha256")
    .update(JSON.stringify({
      processor_id: processor.id,
      version: processor.version,
      type: draft.type,
      title: draft.title,
      summary: draft.summary,
      source_records: sourceRecords,
      source_views: sourceViews,
      content: draft.content ?? {},
      index,
    }))
    .digest("hex")
    .slice(0, 16);
  return `${draft.type}:${processor.id}:${hash}`;
}

function compilerModeFor(processor: ProcessorDefinition): NonNullable<ContextView["compiler"]>["mode"] {
  if (processor.runtime.kind === "llm" || processor.runtime.kind === "agent_task") return "llm";
  if (processor.runtime.kind === "local") return "deterministic";
  return "hybrid";
}

function inheritedScope(processor: ProcessorDefinition, draft: ViewDraft): ContextView["scope"] {
  if (!draft.scope && processor.policy?.privacy) return undefined;
  return draft.scope;
}

function inheritedPrivacy(processor: ProcessorDefinition, draft: ViewDraft): ContextRecord["privacy"] {
  if (draft.privacy) return draft.privacy;
  const privacy = processor.policy?.privacy;
  if (!privacy || privacy === "inherit") return undefined;
  return { level: privacy };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
