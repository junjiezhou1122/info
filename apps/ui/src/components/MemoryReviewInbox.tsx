import React, { useEffect, useMemo, useState } from "react";
import { fetchMemoryCandidates } from "../api";
import type { ContextViewSummary } from "../types";

export default function MemoryReviewInbox({
  onInspect,
}: {
  onInspect?: (state: { view?: ContextViewSummary; loading: boolean }) => void;
}) {
  const [candidates, setCandidates] = useState<ContextViewSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Record<string, string>>(() => ({}));

  useEffect(() => { void refresh(); }, []);

  const selectedCandidate = useMemo(() => candidates.find(c => c.id === selectedId), [candidates, selectedId]);

  async function refresh() {
    setLoading(true);
    setStatus("Loading memory candidates…");
    try {
      const list = await fetchMemoryCandidates();
      setCandidates(list);
      setStatus(`${list.length} candidates`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function handleAction(id: string, action: "accept" | "reject" | "promote") {
    setResolved(prev => ({ ...prev, [id]: action }));
    setStatus(`Marked ${id} as ${action}`);
  }

  const filtered = candidates.filter(c => !resolved[c.id] || resolved[c.id] === "pending");

  return (
    <section className="mri-panel">
      <div className="mri-toolbar">
        <button className="secondary" onClick={refresh} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
        <span className="mri-status">{status}</span>
      </div>
      <div className="mri-list">
        {filtered.map(candidate => (
          <button
            key={candidate.id}
            className={`mri-row ${selectedId === candidate.id ? "selected" : ""}`}
            onClick={() => {
              setSelectedId(candidate.id);
              onInspect?.({ view: candidate, loading: false });
            }}
          >
            <div className="mri-row-top">
              <span className="mri-row-type">{candidate.view_type}</span>
              {typeof candidate.confidence === "number" && (
                <b className="mri-row-confidence">{Math.round(candidate.confidence * 100)}%</b>
              )}
            </div>
            <h4>{candidate.title || candidate.id}</h4>
            <p className="mri-row-summary">{candidate.summary || "No summary."}</p>
            <div className="mri-actions">
              <button onClick={() => handleAction(candidate.id, "accept")} className="action-accept">Accept</button>
              <button onClick={() => handleAction(candidate.id, "reject")} className="action-reject">Reject</button>
              <button onClick={() => handleAction(candidate.id, "promote")} className="action-promote">Promote</button>
            </div>
          </button>
        ))}
        {filtered.length === 0 && !loading && <div className="empty-inline">No pending memory candidates.</div>}
      </div>
    </section>
  );
}
