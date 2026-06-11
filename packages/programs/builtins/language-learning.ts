import { runLanguageLearningPlugin } from "@info/core";
import type { AttentionDecision, ContextSignal, Program, ProgramRunResult } from "../types.js";
import type { ContextStore, ContextView, StoredContextRecord } from "@info/core";

const LANGUAGE_SCHEMAS = new Set([
  "observation.browser_page_snapshot",
  "observation.browser_page_saved",
  "observation.browser_text_selected",
  "observation.browser_text_copied",
  "observation.browser_search_query",
  "observation.screenpipe_activity",
  "observation.screenpipe_input_event",
  "observation.ai_chat",
  "extraction.reader_snapshot",
  "observation.youtube.comprehension_gap",
]);

// A comprehension gap is a strong, explicit signal: the user pressed
// Shift+C repeatedly to turn captions on/off within a video segment,
// which means they couldn't follow the audio. We treat it as the
// highest-confidence input the language program can react to.
const YOUTUBE_GAP_SCHEMA = "observation.youtube.comprehension_gap";

export const languageLearningProgram: Program = {
  id: "program.language_learning",
  title: "Language Learning",
  purpose: "Turn the user's real English exposure into personalized learning views.",
  version: "0.1.0",
  default_speed: "background",
  default_autonomy: "draft",
  capabilities: ["language.detect", "vocabulary.extract", "review.schedule"],
  applications: ["app.language_dashboard", "browser.tooltip"],
  produces: ["memory.language.vocabulary_exposure", "app.language.learning_pack", "app.language.review_queue", "memory.language.difficult_segments"],
  learns_from: ["feedback.language.word_known", "feedback.language.review_completed", "behavior.language.card_skipped"],

  attention(signal: ContextSignal, _store: ContextStore): AttentionDecision {
    if (signal.object_kind === "view" && signal.object_type.startsWith("memory.language.")) {
      return { action: "ignore", reason: "own language memory view", confidence: 0.95 };
    }

    if (signal.object_type.startsWith("feedback.language.")) {
      return { action: "run", reason: "language feedback should update learning views", confidence: 0.9, speed: "background" };
    }

    // YouTube comprehension gaps are explicit, structured signals: the user
    // toggled captions repeatedly within a window, so we treat them as a
    // high-confidence review-queue item rather than generic exposure.
    if (signal.object_type === YOUTUBE_GAP_SCHEMA) {
      return {
        action: "run",
        reason: "YouTube comprehension gap captured; emit a review-queue item",
        confidence: 0.92,
        speed: "glance",
      };
    }

    const languageScore = signal.language === "en" ? 0.35 : englishish(signal) ? 0.22 : 0;
    const sourceScore = LANGUAGE_SCHEMAS.has(signal.object_type) || signal.source === "browser" || signal.source === "screenpipe" || signal.source === "reader" ? 0.28 : 0;
    const attentionScore = signal.object_type.includes("selected") || signal.object_type.includes("copied") || signal.object_type.includes("search_query") ? 0.22 : 0;
    const textScore = (signal.text_preview?.length ?? 0) >= 40 ? 0.15 : 0;
    const score = Number(Math.min(1, languageScore + sourceScore + attentionScore + textScore).toFixed(3));

    if (score >= 0.55) {
      return { action: "run", reason: `English exposure candidate (${score})`, confidence: score, speed: attentionScore ? "glance" : "background" };
    }
    if (score >= 0.35) {
      return { action: "defer", reason: `Possible English exposure but weak signal (${score})`, confidence: score };
    }
    return { action: "ignore", reason: `Not language-learning relevant (${score})`, confidence: score };
  },

  run({ signal, store }): ProgramRunResult {
    if (signal.object_type === YOUTUBE_GAP_SCHEMA) {
      const record = store.getRecord(signal.object_id);
      if (!record) return { ok: false, reason: `youtube gap record not found: ${signal.object_id}` };
      const reviewView = buildYouTubeGapReviewView(record);
      const memoryView = buildYouTubeGapMemoryView(record);
      return {
        ok: true,
        reason: `built review queue + memory for youtube gap ${record.id}`,
        views: [reviewView, memoryView],
        diagnostics: { source: "program.language_learning.youtube_gap", record_id: record.id },
      };
    }
    const result = runLanguageLearningPlugin({ days: 7, limit: 120, write: false }, store);
    return {
      ok: result.ok,
      reason: `compiled ${result.views.length} language learning views from ${result.records_used} records`,
      views: result.views,
      diagnostics: {
        records_used: result.records_used,
        vocabulary_count: result.vocabulary.length,
        examples_count: result.examples.length,
        source: "program.language_learning",
      },
    };
  },
};

function youtubeGapPayload(record: StoredContextRecord): any {
  return (record.payload as any)?.gap ?? {};
}

function buildYouTubeGapReviewView(record: StoredContextRecord): ContextView {
  const now = new Date().toISOString();
  const gap = youtubeGapPayload(record);
  const id = `app:language:review-queue:${gap.video_id ?? record.id}:${gap.start_seconds ?? 0}-${gap.end_seconds ?? 0}`;
  const samples: string[] = Array.isArray(gap.transcript_samples) ? gap.transcript_samples : [];
  return {
    id,
    view_type: "app.language.review_queue",
    title: `Review: ${gap.video_title ?? "YouTube segment"}`.slice(0, 180),
    summary: samples.length
      ? `Captions needed for: ${samples.join(" / ")}`
      : `User needed captions from ${gap.start_seconds ?? 0}s to ${gap.end_seconds ?? 0}s of ${gap.video_title ?? "video"}.`,
    status: "candidate",
    source_records: [record.id],
    compiler: { id: "program.language_learning", version: "0.1.0", mode: "deterministic" },
    purpose: "Surface a comprehension gap as a learnable review-queue item.",
    scope: { domain: record.scope?.domain, app: record.scope?.app, project: record.scope?.project, project_path: record.scope?.project_path, time_range: { start: record.time?.observed_at, end: now }, plugin_id: "program.language_learning" },
    content: {
      video_id: gap.video_id,
      video_title: gap.video_title,
      video_url: gap.video_url,
      start_seconds: gap.start_seconds,
      end_seconds: gap.end_seconds,
      caption_on_ms: gap.caption_on_ms,
      toggles: gap.toggles,
      transcript_samples: samples,
      source: "youtube.comprehension_gap",
    },
    confidence: 0.85,
    stability: "session",
    lossiness: "low",
    privacy: { level: record.privacy?.level ?? "private", retention: "normal", allow_embedding: false, allow_llm_summary: true, allow_external_llm: false, allow_external_reader: false },
    metadata: { source_url: gap.video_url, source_schema: record.schema.name, language_program_version: "0.1.0" },
  };
}

function buildYouTubeGapMemoryView(record: StoredContextRecord): ContextView {
  const now = new Date().toISOString();
  const gap = youtubeGapPayload(record);
  const id = `memory:language:difficult-segments:${gap.video_id ?? record.id}`;
  return {
    id,
    view_type: "memory.language.difficult_segments",
    title: `Difficult segments: ${gap.video_title ?? "YouTube video"}`.slice(0, 180),
    summary: `User needed captions ${gap.toggles ?? 0} times across ${gap.caption_on_ms ?? 0}ms of playback.`,
    status: "candidate",
    source_records: [record.id],
    compiler: { id: "program.language_learning", version: "0.1.0", mode: "deterministic" },
    purpose: "Long-term memory of comprehension difficulty per video.",
    scope: { domain: record.scope?.domain, app: record.scope?.app, project: record.scope?.project, project_path: record.scope?.project_path, time_range: { start: record.time?.observed_at, end: now }, plugin_id: "program.language_learning" },
    content: {
      video_id: gap.video_id,
      video_title: gap.video_title,
      video_url: gap.video_url,
      total_caption_on_ms: gap.caption_on_ms,
      total_toggles: gap.toggles,
      transcript_samples: Array.isArray(gap.transcript_samples) ? gap.transcript_samples : [],
      last_observed_at: record.time?.observed_at ?? now,
    },
    confidence: 0.8,
    stability: "long_term",
    lossiness: "medium",
    privacy: { level: record.privacy?.level ?? "private", retention: "normal", allow_embedding: false, allow_llm_summary: true, allow_external_llm: false, allow_external_reader: false },
    metadata: { source_url: gap.video_url, source_schema: record.schema.name, memory_kind: "language_difficult_segments" },
  };
}

function englishish(signal: ContextSignal): boolean {
  const text = [signal.title, signal.text_preview, signal.url].filter(Boolean).join(" ");
  const letters = text.match(/[A-Za-z]/g)?.length ?? 0;
  const cjk = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  return letters >= 30 && letters > cjk * 2;
}
