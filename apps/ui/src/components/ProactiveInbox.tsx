import React, { useEffect, useMemo, useState } from "react";
import { fetchProactiveSuggestions } from "../api";
import type { ContextViewSummary } from "../types";

export default function ProactiveInbox({
  onInspect,
}: {
  onInspect?: (state: { view?: ContextViewSummary; loading: boolean }) => void;
}) {
  const [suggestions, setSuggestions] = useState<ContextViewSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => { void refresh(); }, []);

  const selected = useMemo(() => suggestions.find(s => s.id === selectedId), [suggestions, selectedId]);

  async function refresh() {
    setLoading(true);
    setStatus("Loading proactive suggestions…");
    try {
      const list = await fetchProactiveSuggestions();
      setSuggestions(list);
      setStatus(`${list.length} suggestions`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="pi-panel">
      <div className="pi-toolbar">
        <button className="secondary" onClick={refresh} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
        <span className="pi-status">{status}</span>
      </div>
      <div className="pi-list">
        {suggestions.map(suggestion => (
          <button
            key={suggestion.id}
            className={`pi-row ${selectedId === suggestion.id ? "selected" : ""}`}
            onClick={() => {
              setSelectedId(suggestion.id);
              onInspect?.({ view: suggestion, loading: false });
            }}
          >
            <div className="pi-row-top">
              <span className="pi-row-type">{suggestion.view_type}</span>
              {typeof suggestion.confidence === "number" && (
                <b className="pi-row-confidence">{Math.round(suggestion.confidence * 100)}%</b>
              )}
            </div>
            <h4>{suggestion.title || suggestion.id}</h4>
            <p className="pi-row-summary">{suggestion.summary || "No summary."}</p>
            <div className="pi-actions">
              <button className="action-accept">Apply</button>
              <button className="action-dismiss">Dismiss</button>
            </div>
          </button>
        ))}
        {suggestions.length === 0 && !loading && <div className="empty-inline">No proactive suggestions.</div>}
      </div>
    </section>
  );
}
