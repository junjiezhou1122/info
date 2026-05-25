import type { ActivityTimelineResponse, RuntimeTickResponse } from "./types";

const API_BASE = import.meta.env.VITE_CONTEXT_API_BASE ?? "http://localhost:3111";

export function screenpipeFrameUrl(frameId: string | number): string {
  return `${API_BASE}/screenpipe/frames/${encodeURIComponent(String(frameId))}`;
}

export async function syncScreenpipe(windowMinutes = 15): Promise<RuntimeTickResponse> {
  const res = await fetch(`${API_BASE}/runtime/tick`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      include_screenpipe: true,
      include_ai_sessions: false,
      include_git: false,
      force: true,
      window_minutes: windowMinutes,
      compile_views: false,
      screenpipe_limit: 60,
    }),
  });
  if (!res.ok) throw new Error(`screenpipe sync failed: ${res.status}`);
  return res.json();
}

export async function fetchActivityTimeline(options: { minutes?: number; limit?: number; bucketMinutes?: number; includeLowLevelScreenpipe?: boolean; dedupe?: boolean; bucketItemLimit?: number | false; summarizeHeartbeats?: boolean; sourceFilter?: "screenpipe" | "browser" | "runtime" | "all"; mergeContinuous?: boolean; mergeGapMinutes?: number } = {}): Promise<ActivityTimelineResponse> {
  const minutes = options.minutes ?? 180;
  const sourceFilter = options.sourceFilter ?? "all";
  const res = await fetch(`${API_BASE}/timeline/activity/compile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      minutes,
      limit: options.limit ?? timelineRecordLimit(minutes, sourceFilter),
      bucket_minutes: options.bucketMinutes ?? 10,
      include_low_level_screenpipe: options.includeLowLevelScreenpipe ?? true,
      include_runtime_events: false,
      dedupe: options.dedupe ?? false,
      bucket_item_limit: options.bucketItemLimit ?? false,
      summarize_heartbeats: options.summarizeHeartbeats ?? false,
      source_filter: sourceFilter,
      merge_continuous: options.mergeContinuous ?? true,
      merge_gap_minutes: options.mergeGapMinutes ?? 3,
      write: false,
    }),
  });
  if (!res.ok) throw new Error(`timeline compile failed: ${res.status}`);
  return res.json();
}

function timelineRecordLimit(minutes: number, sourceFilter: "screenpipe" | "browser" | "runtime" | "all") {
  const samplesPerMinute = sourceFilter === "runtime" ? 2 : sourceFilter === "browser" ? 10 : sourceFilter === "screenpipe" ? 12 : 16;
  const minimum = sourceFilter === "runtime" ? 200 : 900;
  return Math.min(12_000, Math.max(minimum, Math.ceil(minutes * samplesPerMinute)));
}
