import React, { useEffect, useMemo, useState } from "react";
import { fetchProcessorTraces } from "../api";
import type { ContextViewSummary } from "../types";

interface ProcessorTrace {
  id: string;
  event_type: string;
  actor: string;
  status: string;
  subject_type: string;
  subject_id: string;
  payload?: Record<string, unknown>;
  created_at: string;
}

export default function ProcessorTracesPanel({
  onInspect,
}: {
  onInspect?: (state: { view?: ContextViewSummary; loading: boolean }) => void;
}) {
  const [traces, setTraces] = useState<ProcessorTrace[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => { void refresh(); }, []);

  const selected = useMemo(() => traces.find(t => t.id === selectedId), [traces, selectedId]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return traces;
    const q = filter.toLowerCase();
    return traces.filter(t =>
      t.event_type.toLowerCase().includes(q) ||
      t.subject_id.toLowerCase().includes(q) ||
      t.actor.toLowerCase().includes(q)
    );
  }, [traces, filter]);

  async function refresh() {
    setLoading(true);
    setStatus("Loading processor traces…");
    try {
      const events = await fetchProcessorTraces();
      setTraces(events);
      setStatus(`${events.length} traces`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="pt-panel">
      <div className="pt-toolbar">
        <button className="secondary" onClick={refresh} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter traces…" />
        <span className="pt-status">{status}</span>
      </div>
      <div className="pt-list">
        {filtered.map(trace => (
          <button
            key={trace.id}
            className={`pt-row ${selectedId === trace.id ? "selected" : ""}`}
            onClick={() => setSelectedId(trace.id)}
          >
            <div className="pt-row-top">
              <span className="pt-row-type">{trace.event_type}</span>
              <span className={`pt-row-status ${trace.status}`}>{trace.status}</span>
            </div>
            <p className="pt-row-subject">{trace.subject_id}</p>
            <p className="pt-row-actor">{trace.actor} · {new Date(trace.created_at).toLocaleString()}</p>
            {trace.payload && (
              <pre className="pt-payload">
                {JSON.stringify(trace.payload, null, 2)}
              </pre>
            )}
          </button>
        ))}
        {filtered.length === 0 && !loading && <div className="empty-inline">No processor traces found.</div>}
      </div>
    </section>
  );
}
