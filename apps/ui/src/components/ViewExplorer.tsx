import React, { useEffect, useMemo, useRef, useState } from "react";
import { fetchContextView, fetchViewFamilies, fetchViewsByType } from "../api";
import type { ContextViewSummary } from "../types";

export default function ViewExplorer({
  onInspect,
}: {
  onInspect?: (state: { view?: ContextViewSummary; loading: boolean }) => void;
}) {
  const [families, setFamilies] = useState<{ family: string; count: number }[]>([]);
  const [selectedType, setSelectedType] = useState<string>("intent");
  const [views, setViews] = useState<ContextViewSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ContextViewSummary | null>(null);
  const [filter, setFilter] = useState("");
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const filteredViews = useMemo(() => {
    const list = views.filter(v => v.view_type === selectedType);
    if (!filter.trim()) return list;
    const q = filter.toLowerCase();
    return list.filter(
      v =>
        v.title?.toLowerCase().includes(q) ||
        v.summary?.toLowerCase().includes(q) ||
        v.id.toLowerCase().includes(q)
    );
  }, [views, selectedType, filter]);

  const selectedSummary = filteredViews.find(v => v.id === selectedViewId) ?? filteredViews[0];
  const activeView = selectedDetail?.id === selectedSummary?.id ? selectedDetail : selectedSummary;

  const currentTypeCount = useMemo(() => {
    return families.find(f => f.family === selectedType)?.count ?? 0;
  }, [families, selectedType]);

  useEffect(() => { void loadFamilies(); }, []);

  useEffect(() => {
    if (!selectedType) return;
    let cancelled = false;
    setLoading(true);
    setStatus("");
    fetchViewsByType(selectedType, { limit: 80 })
      .then(result => {
        if (cancelled) return;
        setViews(prev => {
          const map = new Map(prev.map(v => [v.id, v]));
          for (const v of (result.views ?? [] as ContextViewSummary[])) map.set(v.id, v);
          return [...map.values()];
        });
      })
      .catch(err => !cancelled && setStatus(err instanceof Error ? err.message : String(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [selectedType]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) void loadMore();
    }, { root: null, rootMargin: "900px 0px", threshold: 0.01 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [filteredViews.length, selectedType, loading]);

  useEffect(() => {
    if (!selectedViewId) {
      setSelectedDetail(null);
      return;
    }
    let cancelled = false;
    setDetailsLoading(true);
    fetchContextView(selectedViewId)
      .then(view => !cancelled && setSelectedDetail(view))
      .catch(() => !cancelled && setSelectedDetail(null))
      .finally(() => !cancelled && setDetailsLoading(false));
    return () => { cancelled = true; };
  }, [selectedViewId]);

  useEffect(() => { onInspect?.({ view: activeView, loading: detailsLoading }); }, [activeView, detailsLoading, onInspect]);

  async function loadFamilies() {
    setLoading(true);
    try {
      const res = await fetchViewFamilies();
      const list = res.families?.map(f => ({ family: f.family, count: f.count })) ?? [];
      setFamilies(list.filter(f => f.count > 0));
      if (!selectedType || !list.find(f => f.family === selectedType)) {
        setSelectedType(list.find(f => f.count > 0)?.family ?? "intent");
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (loading || filteredViews.length >= currentTypeCount) return;
    setLoading(true);
    try {
      const result = await fetchViewsByType(selectedType, { limit: 80, cursor: filteredViews[filteredViews.length - 1]?.updated_at });
      setViews(prev => {
        const map = new Map(prev.map(v => [v.id, v]));
        for (const v of (result.views ?? [] as ContextViewSummary[])) map.set(v.id, v);
        return [...map.values()];
      });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="vx-panel">
      <div className="vx-toolbar">
        <div className="vx-family-select">
          <select value={selectedType} onChange={e => setSelectedType(e.target.value)}>
            {families.map(f => (
              <option key={f.family} value={f.family}>{viewFamilyLabel(f.family)} ({f.count})</option>
            ))}
          </select>
        </div>
        <input className="vx-filter" placeholder="Filter by title/summary..." value={filter} onChange={e => setFilter(e.target.value)} />
      </div>
      <div className="vx-list">
        {filteredViews.length === 0 && !loading
          ? <div className="empty-inline">No {viewFamilyLabel(selectedType)} found.</div>
          : filteredViews.map(view => (
            <button
              key={view.id}
              className={`vx-row ${selectedViewId === view.id ? "selected" : ""}`}
              onClick={() => setSelectedViewId(view.id)}
            >
              <div className="vx-row-top">
                <span className="vx-row-type">{view.view_type}</span>
                {typeof view.confidence === "number" && <b className="vx-row-confidence">{Math.round(view.confidence * 100)}%</b>}
              </div>
              <h4>{view.title || view.id}</h4>
              {view.summary && <p className="vx-row-summary">{view.summary}</p>}
              <div className="vx-row-meta">
                <span>{relativeTime(view.updated_at)}</span>
                <span>{view.status ?? "active"}</span>
              </div>
            </button>
          ))}
      </div>
      {filteredViews.length < currentTypeCount && (
        <div ref={loadMoreRef} className="empty-inline">Loading...</div>
      )}
    </section>
  );
}

function viewFamilyLabel(family: string) {
  const labels: Record<string, string> = {
    evidence: "Evidence",
    visual_frame: "Visual Frame",
    audio: "Audio",
    activity: "Activity",
    activity_block: "Activity Block",
    proposal: "Proposal",
    resource: "Resource",
    intent: "Intent",
    workflow: "Workflow",
    memory: "Memory",
    "memory.candidate": "Memory Candidate",
    "memory.gate": "Memory Gate",
    "project.current": "Project",
    "work.focus_set": "Work Focus",
  };
  return labels[family] ?? family;
}

function relativeTime(iso?: string) {
  if (!iso) return "-";
  const delta = Date.now() - Date.parse(iso);
  if (!Number.isFinite(delta)) return "-";
  const s = Math.max(1, Math.round(delta / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}
