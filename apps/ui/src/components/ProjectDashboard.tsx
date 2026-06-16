import React, { useEffect, useMemo, useState } from "react";
import { fetchProjectCurrentViews, fetchWorkFocusSetViews } from "../api";
import type { ContextViewSummary, WorkFocusLane } from "../types";

export default function ProjectDashboard({
  onInspect,
}: {
  onInspect?: (state: { view?: ContextViewSummary; loading: boolean }) => void;
}) {
  const [projects, setProjects] = useState<ContextViewSummary[]>([]);
  const [focusSets, setFocusSets] = useState<ContextViewSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => { void refresh(); }, []);

  const selected = useMemo(() => projects.find(p => p.id === selectedId), [projects, selectedId]);

  async function refresh() {
    setLoading(true);
    setStatus("Loading project dashboard…");
    try {
      const [p, w] = await Promise.all([
        fetchProjectCurrentViews(),
        fetchWorkFocusSetViews(),
      ]);
      setProjects(p);
      setFocusSets(w);
      setStatus(`${p.length} projects · ${w.length} focus sets`);
      if (!selectedId || !p.find(pr => pr.id === selectedId)) {
        setSelectedId(p[0]?.id ?? null);
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="pd-panel">
      <div className="pd-toolbar">
        <button className="secondary" onClick={refresh} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
        <span className="pd-status">{status}</span>
      </div>
      <div className="pd-list">
        {projects.map(project => (
          <button key={project.id} className={`pd-row ${selectedId === project.id ? "selected" : ""}`} onClick={() => { setSelectedId(project.id); onInspect?.({ view: project, loading: false }); }}>
            <div className="pd-row-top">
              <span className="pd-row-type">project.current</span>
              {typeof project.confidence === "number" && <b className="pd-row-confidence">{Math.round(project.confidence * 100)}%</b>}
            </div>
            <h4>{project.title || project.id}</h4>
            <p className="pd-row-summary">{project.summary || "No summary."}</p>
            <ProjectDetails content={project.content} />
          </button>
        ))}
        {projects.length === 0 && !loading && <div className="empty-inline">No project current views.</div>}
      </div>
      {focusSets.length > 0 && <FocusSetSection focusSets={focusSets} />}
    </section>
  );
}

function ProjectDetails({ content }: { content: Record<string, unknown> | undefined }) {
  if (!content) return null;
  const decisions = (content.decisions ?? []) as string[];
  const questions = (content.open_questions ?? []) as string[];
  const actions = (content.next_actions ?? []) as string[];
  const files = (content.active_files ?? []) as string[];
  return (
    <div className="pd-details">
      {decisions.length > 0 && (
        <div className="pd-section">
          <span className="pd-section-title">Decisions</span>
          <ul>{decisions.map((d, i) => <li key={i}>{d}</li>)}</ul>
        </div>
      )}
      {questions.length > 0 && (
        <div className="pd-section">
          <span className="pd-section-title">Open Questions</span>
          <ul>{questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
        </div>
      )}
      {actions.length > 0 && (
        <div className="pd-section">
          <span className="pd-section-title">Next Actions</span>
          <ul>{actions.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      )}
      {files.length > 0 && (
        <div className="pd-section">
          <span className="pd-section-title">Active Files</span>
          <ul>{files.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function FocusSetSection({ focusSets }: { focusSets: ContextViewSummary[] }) {
  const latest = focusSets[0];
  const lanes = Array.isArray(latest?.content?.active_lanes) ? (latest.content.active_lanes as unknown as WorkFocusLane[]) : [];
  return (
    <div className="pd-focus-sets">
      <h4>Work Focus Set</h4>
      {lanes.length > 0 ? (
        <ul>
          {lanes.map(lane => (
            <li key={lane.lane_key}><b>{lane.label}</b> ({Math.round(lane.attention_share * 100)}%)</li>
          ))}
        </ul>
      ) : (
        <p>No active lanes.</p>
      )}
    </div>
  );
}
