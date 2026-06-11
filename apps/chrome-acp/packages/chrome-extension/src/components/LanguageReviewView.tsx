import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, ExternalLink, Loader2, RefreshCw, Volume2, X } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  ScrollArea,
} from "@chrome-acp/shared/components";
import "@chrome-acp/shared/components";

type ReviewItem = {
  id: string;
  view_type: string;
  title?: string;
  summary?: string;
  content?: Record<string, unknown>;
  updated_at?: string;
  confidence?: number;
};

type ListResponse = {
  ok: boolean;
  views?: ReviewItem[];
  next_cursor?: string;
  error?: string;
};

type RecentCaptionGap = {
  id?: string;
  video_id?: string;
  video_title?: string;
  video_url?: string;
  start_seconds?: number;
  end_seconds?: number;
  caption_on_ms?: number;
  toggles?: number;
  transcript_samples?: string[];
  current_caption?: string | null;
  captured_at?: string;
  status?: string;
};

const RECENT_GAPS_KEY = "language.recent_caption_gaps";

const SAMPLE_ICON: Record<string, string> = {
  review_queue: "review",
  difficult_segments: "memory",
};

function pickSamples(content: Record<string, unknown> | undefined): string[] {
  if (!content) return [];
  const samples = content.transcript_samples;
  if (Array.isArray(samples)) return samples.map(String);
  return [];
}

function pickVideoUrl(content: Record<string, unknown> | undefined): string | undefined {
  if (!content) return undefined;
  const u = content.video_url;
  return typeof u === "string" ? u : undefined;
}

function pickTimestamps(content: Record<string, unknown> | undefined): { start?: number; end?: number } {
  if (!content) return {};
  return {
    start: typeof content.start_seconds === "number" ? (content.start_seconds as number) : undefined,
    end: typeof content.end_seconds === "number" ? (content.end_seconds as number) : undefined,
  };
}

function formatTime(seconds?: number): string {
  if (typeof seconds !== "number" || Number.isNaN(seconds)) return "0:00";
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function formatCaptionRange(gap: RecentCaptionGap): string {
  const start = formatTime(gap.start_seconds);
  if (gap.status === "active") return `${start} - Live now`;
  return `${start} - ${formatTime(gap.end_seconds)}`;
}

function recentCaptionLines(gap: RecentCaptionGap): string[] {
  const lines: string[] = [];
  const current = typeof gap.current_caption === "string" ? gap.current_caption.trim() : "";
  if (current) lines.push(current);
  const samples = Array.isArray(gap.transcript_samples) ? [...gap.transcript_samples].reverse() : [];
  for (const sample of samples) {
    const text = String(sample).trim();
    if (text && !lines.includes(text)) lines.push(text);
    if (lines.length >= 2) break;
  }
  return lines;
}

export function LanguageReviewView() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [recentGaps, setRecentGaps] = useState<RecentCaptionGap[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshTimer = useRef<number | null>(null);
  const recentTimer = useRef<number | null>(null);

  const loadRecentGaps = useCallback(async () => {
    try {
      const stored = await chrome.storage?.session?.get?.(RECENT_GAPS_KEY);
      const gaps = Array.isArray(stored?.[RECENT_GAPS_KEY]) ? stored[RECENT_GAPS_KEY] : [];
      setRecentGaps(gaps);
    } catch {
      setRecentGaps([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = (await chrome.runtime.sendMessage({
        type: "list-ambient-tasks",
        viewTypes: ["app.language.review_queue", "memory.language.difficult_segments"],
        limit: 50,
        activeOnly: false,
      })) as ListResponse;
      if (!response?.ok) {
        setError(response?.error ?? "Failed to load review items");
        setItems([]);
        return;
      }
      setItems(response.views ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadRecentGaps();
    const handleStorageChange = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === "session" && changes[RECENT_GAPS_KEY]) void loadRecentGaps();
    };
    chrome.storage?.onChanged?.addListener?.(handleStorageChange);
    refreshTimer.current = window.setInterval(() => void load(), 12_000);
    recentTimer.current = window.setInterval(() => void loadRecentGaps(), 2_000);
    return () => {
      chrome.storage?.onChanged?.removeListener?.(handleStorageChange);
      if (refreshTimer.current) window.clearInterval(refreshTimer.current);
      if (recentTimer.current) window.clearInterval(recentTimer.current);
    };
  }, [load, loadRecentGaps]);

  const queueItems = useMemo(
    () => items.filter(i => i.view_type === "app.language.review_queue"),
    [items],
  );
  const memoryItems = useMemo(
    () => items.filter(i => i.view_type === "memory.language.difficult_segments"),
    [items],
  );

  return (
    <div className="flex flex-col h-full">
      <header className="px-3 pt-3 pb-2 flex items-center justify-between gap-2 border-b">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Language</h2>
          <Badge variant="secondary" className="text-[10px]">
            {queueItems.length}
          </Badge>
        </div>
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading} title="Refresh">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </header>

      {error && (
        <div className="px-3 py-2 text-xs text-destructive flex items-center gap-1.5 border-b">
          <X className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {!loading && !error && queueItems.length === 0 && memoryItems.length === 0 && recentGaps.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-12">
              <BookOpen className="h-5 w-5 mx-auto mb-2 opacity-50" />
              <p>No review items yet.</p>
              <p className="mt-1">Watch a YouTube video and press <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">Shift+C</kbd> when you need captions.</p>
            </div>
          )}

          {recentGaps.length > 0 && (
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1 mb-1.5">
                Recent caption segments
              </h3>
              <div className="space-y-2">
                {recentGaps.slice(0, 5).map((gap, index) => {
                  const captionLines = recentCaptionLines(gap);
                  return (
                  <Card key={gap.id ?? index} className="border-blue-200/70 bg-blue-50/40 dark:border-blue-900/50 dark:bg-blue-950/20">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium leading-snug line-clamp-2">
                            {gap.video_title || "YouTube caption segment"}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {formatCaptionRange(gap)}
                            {" · "}
                            {Math.round((gap.caption_on_ms ?? 0) / 1000)}s captions
                            {" · "}
                            {gap.toggles ?? 0} toggles
                          </div>
                        </div>
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          {gap.status === "active" ? "live" : "saved"}
                        </Badge>
                      </div>
                      {captionLines.length > 0 && (
                        <div className="space-y-1">
                          {captionLines.map((sample, sampleIndex) => (
                            <div key={sampleIndex} className="text-xs text-muted-foreground line-clamp-2 flex items-start gap-1">
                              <Volume2 className="h-3 w-3 mt-0.5 shrink-0" />
                              <span>{sample}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {gap.video_url && (
                        <a
                          href={gap.video_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open video
                        </a>
                      )}
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
            </section>
          )}

          {queueItems.length > 0 && (
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1 mb-1.5">
                Review queue
              </h3>
              <div className="space-y-2">
                {queueItems.map(item => {
                  const content = item.content;
                  const samples = pickSamples(content);
                  const url = pickVideoUrl(content);
                  const { start, end } = pickTimestamps(content);
                  return (
                    <Card key={item.id}>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium leading-snug line-clamp-2">
                              {item.title ?? "YouTube segment"}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2">
                              <span>{formatTime(start)} – {formatTime(end)}</span>
                              {url && (
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 hover:underline truncate"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  <span className="truncate">YouTube</span>
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                        {samples.length > 0 && (
                          <div className="space-y-1">
                            {samples.slice(0, 3).map((s, i) => (
                              <div key={i} className="text-xs text-muted-foreground line-clamp-2 flex items-start gap-1">
                                <Volume2 className="h-3 w-3 mt-0.5 shrink-0" />
                                <span>{s}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Mark as known"
                            onClick={() => sendLanguageFeedback("known", item)}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Got it
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Dismiss"
                            onClick={() => sendLanguageFeedback("dismissed", item)}
                          >
                            <X className="h-3 w-3 mr-1" />
                            Skip
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {memoryItems.length > 0 && (
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1 mb-1.5">
                Difficult segments
              </h3>
              <div className="space-y-1.5">
                {memoryItems.slice(0, 10).map(item => {
                  const captionMs = typeof item.content?.total_caption_on_ms === "number" ? item.content.total_caption_on_ms : 0;
                  const toggles = typeof item.content?.total_toggles === "number" ? item.content.total_toggles : 0;
                  return (
                    <div key={item.id} className="px-2 py-1.5 rounded border bg-muted/30">
                      <div className="text-xs font-medium truncate">{item.title ?? item.id}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {toggles} toggles · {Math.round(captionMs / 1000)}s of captions
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

async function sendLanguageFeedback(kind: "known" | "dismissed", item: ReviewItem): Promise<void> {
  // Optimistic local removal; the server processes the feedback through
  // /feedback?process=true so the language_learning program can learn from it.
  try {
    await chrome.runtime.sendMessage({
      type: "feedback-view",
      viewId: item.id,
      feedbackKind: kind === "known" ? "feedback.language.word_known" : "feedback.analysis.dismissed",
    });
  } catch {
    // The user can re-engage on next refresh; we don't surface the failure
    // because feedback is best-effort and the language program will catch up
    // through its normal feedback loop.
  }
}

export default LanguageReviewView;
