import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_RELATED_VIEW_TYPES, buildViewFeedbackRequest, buildViewQueryFromTab, contextIngestEndpointFromSettings, contextViewUrlFromSettings, contextViewsEndpointFromSettings, feedbackEndpointFromSettings, feedbackTargetFromInput, formatAmbientViewResult, formatViewSubscriptionResult, selectedViewFromInput, selectedViewIdFromInput, viewIdsFromProcessedIngestResponse } from "../browser-extension/agent-task.js";

test("Browser ambient button posts an Observation into Program processing instead of direct AgentTask", () => {
  assert.equal(
    contextIngestEndpointFromSettings(
      { endpoint: "http://127.0.0.1:3111/context/ingest" },
      { process: true, cascadeViews: true },
    ),
    "http://127.0.0.1:3111/context/ingest?process=true&cascade_views=true",
  );

  const background = readFileSync("browser-extension/background.js", "utf8");
  assert.match(background, /captureAmbientRequest[\s\S]+postRecord\(record, \{ process: true, cascadeViews: true \}\)/);
  assert.doesNotMatch(background, /postAgentTask/);
});

test("Browser extension can mark browser observations as allowed for external LLM runtimes", () => {
  const background = readFileSync("browser-extension/background.js", "utf8");
  const popup = readFileSync("browser-extension/popup.html", "utf8");
  const popupJs = readFileSync("browser-extension/popup.js", "utf8");

  assert.match(background, /allowExternalLlm:\s*true/);
  assert.match(background, /allow_external_llm:\s*Boolean\(settings\.allowExternalLlm\)/);
  assert.match(popup, /id="allowExternalLlm"/);
  assert.match(popupJs, /\$\("allowExternalLlm"\)\.checked/);
});

test("Browser popup keeps the primary surface to one Save & Analyze button", () => {
  const popup = readFileSync("browser-extension/popup.html", "utf8");
  const popupJs = readFileSync("browser-extension/popup.js", "utf8");

  assert.match(popup, /Save &amp; Analyze|Save & Analyze/);
  assert.doesNotMatch(popup, /Ambient explore current page/);
  assert.doesNotMatch(popup, /Refresh related Views/);
  assert.doesNotMatch(popup, /Mark current View useful/);
  assert.doesNotMatch(popup, /Dismiss current View/);
  assert.doesNotMatch(popupJs, /save-current-page/);
  assert.match(popupJs, /ambient-current-page/);
});

test("Browser ambient can derive exact View URLs from the ingest endpoint", () => {
  assert.equal(
    contextViewUrlFromSettings({ endpoint: "http://127.0.0.1:3111/context/ingest" }, "analysis:browser:123"),
    "http://127.0.0.1:3111/context/views/analysis%3Abrowser%3A123",
  );
});

test("Browser ambient can derive a cursor-based Views subscription endpoint", () => {
  assert.equal(
    contextViewsEndpointFromSettings(
      { endpoint: "http://127.0.0.1:3111/context/ingest" },
      {
        viewTypes: DEFAULT_RELATED_VIEW_TYPES,
        cursor: "2026-05-25T01:02:03.000Z",
        limit: 10,
        activeOnly: true,
      },
    ),
    "http://127.0.0.1:3111/context/views?limit=10&view_types=analysis.browser_agent_task%2Cproject.current_context%2Cthread.active_work%2Cbrief.project_next_state%2Cbrief.research%2Cmemory.project.patterns&active_only=true&cursor=2026-05-25T01%3A02%3A03.000Z",
  );
});

test("Browser ambient can derive a query-based Views subscription endpoint", () => {
  assert.equal(
    contextViewsEndpointFromSettings(
      { endpoint: "http://127.0.0.1:3111/context/ingest" },
      {
        viewTypes: ["analysis.browser_agent_task"],
        query: "vectorized context routing",
        limit: 5,
        activeOnly: true,
      },
    ),
    "http://127.0.0.1:3111/context/views?limit=5&view_types=analysis.browser_agent_task&active_only=true&query=vectorized+context+routing",
  );
});

test("Browser ambient builds a View query from current tab context", () => {
  assert.equal(
    buildViewQueryFromTab({
      title: "Agent Runtime Architecture Paper",
      url: "https://example.com/agent-runtime-paper.pdf?utm_source=test",
    }),
    "Agent Runtime Architecture Paper example.com /agent-runtime-paper.pdf",
  );
});

test("Browser popup can derive feedback endpoint and build a View feedback Observation request", () => {
  assert.equal(
    feedbackEndpointFromSettings({ endpoint: "http://127.0.0.1:3111/context/ingest" }),
    "http://127.0.0.1:3111/feedback?process=true",
  );
  assert.deepEqual(buildViewFeedbackRequest({
    viewId: "project:ctx",
    type: "analysis.dismissed",
    value: "dismissed",
    reason: "not useful now",
    payload: { surface: "popup" },
  }), {
    type: "analysis.dismissed",
    application_id: "browser.popup",
    view_id: "project:ctx",
    value: "dismissed",
    reason: "not useful now",
    payload: { surface: "popup" },
  });
});

test("Browser ambient extracts Program-produced and cascaded View IDs from processed ingest", () => {
  assert.deepEqual(viewIdsFromProcessedIngestResponse({
    processing: {
      runs: [
        { written_views: ["analysis:agent"] },
        { written_views: ["analysis:agent", "analysis:browser"] },
      ],
    },
    cascade_processing: [{
      runs: [
        { written_views: ["project:ctx", "thread:active"] },
        { written_views: ["brief:research", "analysis:agent"] },
      ],
    }],
  }), ["analysis:agent", "analysis:browser", "project:ctx", "thread:active", "brief:research"]);
});

test("Browser ambient formats returned Views for popup display", () => {
  const text = formatAmbientViewResult({
    ok: true,
    views: [{
      view: {
        id: "analysis:browser:123",
        view_type: "analysis.browser_agent_task",
        title: "Browser agent analysis",
        summary: "This page is relevant to Info runtime design.",
        content: {
          agent_output: {
            key_points: ["Context pack should be automatic", "Agent runtime owns skills"],
          },
        },
      },
    }],
  });

  assert.match(text, /Browser agent analysis/);
  assert.match(text, /Info runtime design/);
  assert.match(text, /Context pack should be automatic/);
  assert.match(text, /analysis:browser:123/);
});

test("Browser ambient formats cascaded Views for popup display", () => {
  const text = formatAmbientViewResult({
    ok: true,
    views: [
      { view: { id: "analysis:browser:123", view_type: "analysis.browser_agent_task", title: "Browser agent analysis", summary: "Primary analysis.", content: {} } },
      { view: { id: "project:ctx", view_type: "project.current_context", title: "Project context", summary: "Derived project context.", content: {} } },
      { view: { id: "brief:research", view_type: "brief.research", title: "Research brief", summary: "Derived research brief.", content: {} } },
    ],
  });

  assert.match(text, /Cascaded views/);
  assert.match(text, /project.current_context/);
  assert.match(text, /brief.research/);
});

test("Browser ambient formats View subscription results without adding intelligence to the popup", () => {
  const text = formatViewSubscriptionResult({
    ok: true,
    next_cursor: "2026-05-25T01:02:03.000Z",
    views: [
      { id: "project:ctx", view_type: "project.current_context", title: "Project context", content: { agent_output: { summary: "Current work is Info runtime." } } },
      { id: "brief:research", view_type: "brief.research", summary: "Research brief from cascaded AgentTask output." },
    ],
  });

  assert.match(text, /2 new View/);
  assert.match(text, /project.current_context/);
  assert.match(text, /Current work is Info runtime/);
  assert.match(text, /#1/);
  assert.match(text, /project:ctx/);
  assert.match(text, /brief.research/);
  assert.match(text, /brief:research/);
});

test("Browser popup can select a feedback target View by list number or explicit id", () => {
  const views = [
    { id: "project:ctx", view_type: "project.current_context" },
    { id: "brief:research", view_type: "brief.research" },
  ];

  assert.deepEqual(selectedViewFromInput("#2", views), { id: "brief:research", view_type: "brief.research" });
  assert.equal(selectedViewIdFromInput("1", views), "project:ctx");
  assert.equal(selectedViewIdFromInput("#2", views), "brief:research");
  assert.equal(selectedViewIdFromInput("brief:research", views), "brief:research");
  assert.equal(selectedViewIdFromInput("", views), "project:ctx");
  assert.equal(selectedViewIdFromInput("9", views), undefined);
});

test("Browser popup explicit invalid feedback target does not fall back to previous target", () => {
  const views = [
    { id: "project:ctx", view_type: "project.current_context" },
    { id: "brief:research", view_type: "brief.research" },
  ];

  assert.deepEqual(feedbackTargetFromInput("", views, "project:ctx"), { ok: true, view: views[0] });
  assert.deepEqual(feedbackTargetFromInput("#2", views, "project:ctx"), { ok: true, view: views[1] });
  assert.deepEqual(feedbackTargetFromInput("9", views, "project:ctx"), { ok: false, error: "Selected View not found." });
});

test("Browser popup feedback request can include target View type as factual metadata", () => {
  assert.deepEqual(buildViewFeedbackRequest({
    viewId: "brief:research",
    viewType: "brief.research",
    type: "analysis.dismissed",
    value: "dismissed",
    payload: { surface: "popup" },
  }).payload, {
    surface: "popup",
    target_view_type: "brief.research",
  });
});
