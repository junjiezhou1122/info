import { buildViewQueryFromTab, formatAmbientViewResult } from "./agent-task.js";

const $ = (id) => document.getElementById(id);
let currentViewQuery = "";

async function send(message) {
  return await chrome.runtime.sendMessage(message);
}

async function refresh() {
  const res = await send({ type: "get-current-status" });
  const tab = res.tab || {};
  const state = res.state || {};
  const settings = res.settings || {};
  currentViewQuery = buildViewQueryFromTab(tab);
  $("status").innerHTML = `
    <b>${escapeHtml(tab.title || "No active tab")}</b><br>
    <span class="muted">${escapeHtml(tab.url || "")}</span><br><br>
    visit: ${escapeHtml(state.visit_id || "-")}<br>
    dwell: ${state.dwell_seconds ?? 0}s · snapshots: ${state.snapshot_count ?? 0} · visit recorded: ${state.visitRecorded ? "yes" : "no"}
  `;
  $("captureStream").checked = Boolean(settings.captureStream);
  $("snapshotOnVisit").checked = Boolean(settings.snapshotOnVisit);
  $("allowExternalLlm").checked = Boolean(settings.allowExternalLlm);
  $("heartbeatSeconds").value = settings.heartbeatSeconds ?? 15;
  $("endpoint").value = settings.endpoint ?? "http://localhost:3111/context/ingest";
}

$("save").addEventListener("click", async () => {
  $("result").textContent = "Saving and analyzing current page…";
  const res = await send({ type: "ambient-current-page", reason: $("saveReason").value.trim() || undefined });
  $("result").textContent = formatAmbientViewResult(res);
  await refresh();
});

async function saveSettings() {
  const settings = {
    captureStream: $("captureStream").checked,
    snapshotOnVisit: $("snapshotOnVisit").checked,
    allowExternalLlm: $("allowExternalLlm").checked,
    heartbeatSeconds: Number($("heartbeatSeconds").value || 15),
    endpoint: $("endpoint").value,
  };
  await send({ type: "update-settings", settings });
}

for (const id of ["captureStream", "snapshotOnVisit", "allowExternalLlm", "heartbeatSeconds", "endpoint"]) {
  $(id).addEventListener("change", saveSettings);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

refresh();
