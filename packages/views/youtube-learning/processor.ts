import { createHash } from "node:crypto";
import type { ContextRecord, ContextView, StoredContextRecord, StoredContextView } from "@info/core";
import type { ProcessorDefinition, ProcessorHandler, ViewDraft } from "../../processor-runtime/types.js";

// ─── Constants ─────────────────────────────────────────────────────────────

export const YOUTUBE_LEARNING_PROCESSOR_ID = "processor.youtube_learning";
export const YOUTUBE_FRAGMENT_VIEW_TYPE = "learning.youtube_fragment";
export const YOUTUBE_REVIEW_QUEUE_VIEW_TYPE = "learning.review_queue";
export const DIFFICULT_SEGMENTS_VIEW_TYPE = "memory.language.difficult_segments";

export const YOUTUBE_CAPTION_STATE_SCHEMA = "observation.youtube.caption_state";
export const YOUTUBE_CAPTION_FRAGMENT_SCHEMA = "observation.youtube.caption_fragment";
export const YOUTUBE_PAUSED_SCHEMA = "observation.youtube.paused";
export const YOUTUBE_PLAYED_SCHEMA = "observation.youtube.played";

// ─── Types ─────────────────────────────────────────────────────────────────

export type YouTubeFragment = {
  video_id: string;
  video_title?: string;
  start_seconds: number;
  end_seconds: number;
  caption_text?: string;
  caption_lang?: string;
  is_difficult?: boolean;
  difficulty_reason?: string;
};

export type YouTubeLearningOptions = {
  now?: Date;
  fragmentMinSeconds?: number;
  maxFragmentDuration?: number;
};

export type VideoSessionState = {
  videoId: string;
  videoTitle?: string;
  isPlaying: boolean;
  captionsEnabled: boolean;
  currentTime: number;
  lastEventAt: number;
  captionsSince: number;
  fragmentBuffer: Array<{ start: number; end: number; text: string }>;
};

// ─── Processor Factory ───────────────────────────────────────────────────

export function createYouTubeLearningProcessor(options: YouTubeLearningOptions = {}): ProcessorDefinition {
  return {
    id: YOUTUBE_LEARNING_PROCESSOR_ID,
    title: "YouTube Learning Fragment Capture",
    version: "0.0.1",
    description: "Captures YouTube playback fragments from pause/resume and caption state observations, producing learning fragments, difficult segments, and review queues.",
    consumes: {
      observations: [
        `${YOUTUBE_CAPTION_STATE_SCHEMA}`,
        `${YOUTUBE_CAPTION_FRAGMENT_SCHEMA}`,
        `${YOUTUBE_PAUSED_SCHEMA}`,
        `${YOUTUBE_PLAYED_SCHEMA}`,
      ],
    },
    produces: {
      views: [YOUTUBE_FRAGMENT_VIEW_TYPE, DIFFICULT_SEGMENTS_VIEW_TYPE, YOUTUBE_REVIEW_QUEUE_VIEW_TYPE],
    },
    runtime: { kind: "local" },
    policy: { speed: "reflex", autonomy: "draft", privacy: "private" },
    handler: youTubeLearningHandler(options),
  };
}

// ─── Handler ───────────────────────────────────────────────────────────────

export function youTubeLearningHandler(options: YouTubeLearningOptions = {}): ProcessorHandler {
  const fragmentMinSeconds = options.fragmentMinSeconds ?? 5;
  const maxFragmentDuration = options.maxFragmentDuration ?? 300;

  return ({ observation, payload: inputPayload }, context) => {
    const now = options.now ?? new Date();
    const payload = (inputPayload ?? {}) as Record<string, unknown>;

    if (!observation) {
      return { views: [], diagnostics: { reason: "no observation" } };
    }

    const schemaName = observation.schema.name;
    const store = context.store;

    // Dispatch by observation schema
    if (schemaName === YOUTUBE_CAPTION_STATE_SCHEMA) {
      return handleCaptionState(observation, now);
    }
    if (schemaName === YOUTUBE_CAPTION_FRAGMENT_SCHEMA) {
      return handleCaptionFragment(observation, now, store, fragmentMinSeconds, maxFragmentDuration);
    }
    if (schemaName === YOUTUBE_PAUSED_SCHEMA) {
      return handlePause(observation, now, store, fragmentMinSeconds, maxFragmentDuration);
    }
    if (schemaName === YOUTUBE_PLAYED_SCHEMA) {
      return handlePlay(observation, now);
    }

    return { views: [], diagnostics: { reason: "unhandled schema", schema: schemaName } };
  };
}

// ─── Caption State ───────────────────────────────────────────────────────────

function handleCaptionState(
  observation: StoredContextRecord,
  now: Date,
): { views: ViewDraft[]; diagnostics: Record<string, unknown> } {
  const enabled = Boolean(observation.payload?.enabled ?? observation.payload?.captions_enabled);
  const videoId = stringValue(observation.payload?.video_id) ?? "unknown";
  const videoTitle = stringValue(observation.payload?.video_title) ?? observation.content?.title;

  return {
    views: [],
    diagnostics: {
      event: "caption_state",
      video_id: videoId,
      video_title: videoTitle,
      captions_enabled: enabled,
      timestamp: now.toISOString(),
    },
  };
}

// ─── Caption Fragment ──────────────────────────────────────────────────────

function handleCaptionFragment(
  observation: StoredContextRecord,
  now: Date,
  store: import("@info/core").ContextStore,
  fragmentMinSeconds: number,
  maxFragmentDuration: number,
): { views: ViewDraft[]; diagnostics: Record<string, unknown> } {
  const videoId = stringValue(observation.payload?.video_id) ?? "unknown";
  const videoTitle = stringValue(observation.payload?.video_title) ?? observation.content?.title;
  const startSeconds = numberValue(observation.payload?.start_seconds) ?? 0;
  const endSeconds = numberValue(observation.payload?.end_seconds) ?? startSeconds;
  const captionText = stringValue(observation.content?.text) ?? stringValue(observation.payload?.caption_text) ?? "";
  const captionLang = stringValue(observation.payload?.caption_lang);

  const fragment: YouTubeFragment = {
    video_id: videoId,
    video_title: videoTitle,
    start_seconds: startSeconds,
    end_seconds: endSeconds,
    caption_text: captionText,
    caption_lang: captionLang,
  };

  return {
    views: [buildFragmentView(fragment, now, undefined, [observation.id])],
    diagnostics: { event: "caption_fragment", video_id: videoId, fragment },
  };
}

// ─── Pause / Play ──────────────────────────────────────────────────────────

function handlePause(
  observation: StoredContextRecord,
  now: Date,
  store: import("@info/core").ContextStore,
  fragmentMinSeconds: number,
  maxFragmentDuration: number,
): { views: ViewDraft[]; diagnostics: Record<string, unknown> } {
  const videoId = stringValue(observation.payload?.video_id) ?? "unknown";
  const videoTitle = stringValue(observation.payload?.video_title) ?? observation.content?.title;
  const currentTime = numberValue(observation.payload?.current_time) ?? 0;

  // Look for existing open fragment for this video (within last 30 minutes)
  const recentFragments = store.listViews({
    view_types: [YOUTUBE_FRAGMENT_VIEW_TYPE],
    active_only: true,
    limit: 100,
  }).filter(v => v.content?.video_id === videoId);

  const openFragment = recentFragments
    .filter(v => !v.content?.closed_at)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];

  const views: ViewDraft[] = [];

  if (openFragment) {
    // Close the open fragment at the pause point
    const startSeconds = numberValue(openFragment.content?.start_seconds) ?? 0;
    const duration = currentTime - startSeconds;

    if (duration >= fragmentMinSeconds && duration <= maxFragmentDuration) {
      const fragment: YouTubeFragment = {
        video_id: videoId,
        video_title: videoTitle,
        start_seconds: startSeconds,
        end_seconds: currentTime,
        caption_text: stringValue(openFragment.content?.caption_text) ?? undefined,
        caption_lang: stringValue(openFragment.content?.caption_lang) ?? undefined,
      };
      views.push(buildFragmentView(fragment, now, openFragment.id, []));
    }
  }

  // Check for difficult-segment signal
  const isDifficult = Boolean(observation.payload?.is_difficult);
  if (isDifficult) {
    const difficultSegment = buildDifficultSegmentView(
      {
        video_id: videoId,
        video_title: videoTitle,
        start_seconds: currentTime - 10,
        end_seconds: currentTime + 5,
        caption_text: stringValue(observation.content?.text),
      },
      now,
      [observation.id],
    );
    views.push(difficultSegment);
  }

  return {
    views,
    diagnostics: {
      event: "paused",
      video_id: videoId,
      current_time: currentTime,
      closed_fragment: Boolean(openFragment),
      is_difficult: isDifficult,
    },
  };
}

function handlePlay(
  observation: StoredContextRecord,
  now: Date,
): { views: ViewDraft[]; diagnostics: Record<string, unknown> } {
  const videoId = stringValue(observation.payload?.video_id) ?? "unknown";
  const videoTitle = stringValue(observation.payload?.video_title) ?? observation.content?.title;
  const currentTime = numberValue(observation.payload?.current_time) ?? 0;

  // Start a new playback fragment
  const fragment: YouTubeFragment = {
    video_id: videoId,
    video_title: videoTitle,
    start_seconds: currentTime,
    end_seconds: currentTime,
    caption_text: undefined,
    caption_lang: undefined,
  };

  // The fragment view is open-ended; it will be closed on the next pause
  return {
    views: [buildFragmentView(fragment, now, observation.id, [observation.id])],
    diagnostics: { event: "played", video_id: videoId, current_time: currentTime },
  };
}

// ─── View Builders ─────────────────────────────────────────────────────────

function buildFragmentView(
  fragment: YouTubeFragment,
  now: Date,
  idHint?: string,
  sourceRecords?: string[],
): ViewDraft {
  const duration = fragment.end_seconds - fragment.start_seconds;
  return {
    type: YOUTUBE_FRAGMENT_VIEW_TYPE,
    id: idHint ?? fragmentId(fragment),
    title: fragment.video_title ? `Fragment: ${fragment.video_title}` : "YouTube Fragment",
    summary: `${fragment.video_id} @ ${formatTime(fragment.start_seconds)}-${formatTime(fragment.end_seconds)} (${duration}s)`,
    status: "candidate",
    source_records: sourceRecords ?? [],
    purpose: "Timestamped playback fragment for language learning review.",
    scope: {
      domain: "youtube.com",
      app: "chrome",
    },
    content: {
      video_id: fragment.video_id,
      video_title: fragment.video_title,
      start_seconds: fragment.start_seconds,
      end_seconds: fragment.end_seconds,
      duration_seconds: duration,
      caption_text: fragment.caption_text,
      caption_lang: fragment.caption_lang,
      is_difficult: fragment.is_difficult ?? false,
      generated_at: now.toISOString(),
    },
    confidence: 0.82,
    stability: "session",
    lossiness: "low",
    privacy: {
      level: "private",
      retention: "normal",
      allow_embedding: false,
      allow_llm_summary: true,
      allow_external_llm: false,
      allow_external_reader: false,
    },
    metadata: {
      generated_at: now.toISOString(),
      processor: YOUTUBE_LEARNING_PROCESSOR_ID,
    },
  };
}

function buildDifficultSegmentView(
  fragment: YouTubeFragment,
  now: Date,
  sourceRecords: string[],
): ViewDraft {
  return {
    type: DIFFICULT_SEGMENTS_VIEW_TYPE,
    id: difficultSegmentId(fragment),
    title: `Difficult: ${fragment.video_title ?? fragment.video_id}`,
    summary: `Difficult segment at ${formatTime(fragment.start_seconds)}-${formatTime(fragment.end_seconds)}`,
    status: "candidate",
    source_records: sourceRecords,
    purpose: "Segment marked as difficult for targeted review.",
    scope: {
      domain: "youtube.com",
      app: "chrome",
    },
    content: {
      video_id: fragment.video_id,
      video_title: fragment.video_title,
      start_seconds: fragment.start_seconds,
      end_seconds: fragment.end_seconds,
      caption_text: fragment.caption_text,
      difficulty_reason: fragment.difficulty_reason ?? "user-marked",
      marked_at: now.toISOString(),
    },
    confidence: 0.88,
    stability: "long_term",
    lossiness: "low",
    privacy: {
      level: "private",
      retention: "normal",
      allow_embedding: false,
      allow_llm_summary: true,
      allow_external_llm: false,
      allow_external_reader: false,
    },
    metadata: {
      generated_at: now.toISOString(),
      processor: YOUTUBE_LEARNING_PROCESSOR_ID,
    },
  };
}

// ─── Review Queue (callable from tests or runtime) ─────────────────────────

export function generateReviewQueue(
  fragments: StoredContextView[],
  difficultSegments: StoredContextView[],
  now: Date = new Date(),
): ViewDraft {
  const allItems = [
    ...fragments.map(f => ({
      type: "fragment" as const,
      video_id: stringValue(f.content?.video_id) ?? "unknown",
      video_title: stringValue(f.content?.video_title),
      start_seconds: numberValue(f.content?.start_seconds) ?? 0,
      end_seconds: numberValue(f.content?.end_seconds) ?? 0,
      caption_text: stringValue(f.content?.caption_text),
      source_view_id: f.id,
    })),
    ...difficultSegments.map(d => ({
      type: "difficult" as const,
      video_id: stringValue(d.content?.video_id) ?? "unknown",
      video_title: stringValue(d.content?.video_title),
      start_seconds: numberValue(d.content?.start_seconds) ?? 0,
      end_seconds: numberValue(d.content?.end_seconds) ?? 0,
      caption_text: stringValue(d.content?.caption_text),
      source_view_id: d.id,
    })),
  ];

  // Sort by start time per video
  allItems.sort((a, b) => {
    if (a.video_id !== b.video_id) return a.video_id.localeCompare(b.video_id);
    return a.start_seconds - b.start_seconds;
  });

  return {
    type: YOUTUBE_REVIEW_QUEUE_VIEW_TYPE,
    id: `review-queue:${stableKey(now.toISOString())}`,
    title: "YouTube Learning Review Queue",
    summary: `${allItems.length} items queued for review`,
    status: "candidate",
    source_views: allItems.map(i => i.source_view_id).filter(Boolean),
    purpose: "Prioritized review queue for language learning from YouTube fragments.",
    scope: { domain: "youtube.com", app: "chrome" },
    content: {
      generated_at: now.toISOString(),
      item_count: allItems.length,
      items: allItems,
    },
    confidence: 0.75,
    stability: "session",
    lossiness: "medium",
    privacy: {
      level: "private",
      retention: "normal",
      allow_embedding: false,
      allow_llm_summary: true,
      allow_external_llm: false,
      allow_external_reader: false,
    },
    metadata: {
      generated_at: now.toISOString(),
      processor: YOUTUBE_LEARNING_PROCESSOR_ID,
    },
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function fragmentId(fragment: YouTubeFragment): string {
  return `youtube-fragment:${fragment.video_id}:${fragment.start_seconds}:${fragment.end_seconds}`;
}

function difficultSegmentId(fragment: YouTubeFragment): string {
  return `difficult:${fragment.video_id}:${Math.floor(fragment.start_seconds)}`;
}

function stableKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
