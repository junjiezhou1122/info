import { describe, it } from "node:test";
import assert from "node:assert";
import type { ContextViewSummary, MemoryCandidateContent, MemoryGateDecision, ProjectCurrentContent, ProcessorRun, WorkFocusLane, WorkFocusSetContent } from "../apps/ui/src/types.js";

describe("UI View, Memory, and Processor surfaces", () => {
  describe("types", () => {
    it("MemoryCandidateContent type exists", () => {
      const content: MemoryCandidateContent = {
        memory_kind: "preference",
        target_view_type: "memory.preferences",
        claim: "test",
        confidence: 0.9,
        evidence_count: 1,
        promotion_policy: {
          min_confidence: 0.7,
          min_evidence_count: 1,
          allow_manual_promote: true,
          require_privacy_check: true,
        },
      };
      assert.strictEqual(content.claim, "test");
    });

    it("MemoryGateDecision type exists", () => {
      const decision: MemoryGateDecision = { action: "accept", candidate_id: "x", target_view_type: "memory.preferences", confidence: 0.9 };
      assert.strictEqual(decision.action, "accept");
    });

    it("ProjectCurrentContent type exists", () => {
      const content: ProjectCurrentContent = { decisions: [] };
      assert.deepStrictEqual(content.decisions, []);
    });

    it("WorkFocusSetContent type exists", () => {
      const lane: WorkFocusLane = {
        lane_key: "test",
        lane_kind: "project",
        label: "Test",
        attention_share: 0.5,
        confidence: 0.8,
        source_records: [],
        candidate_route_ids: [],
        route_scores: [],
        evidence: {},
      };
      assert.strictEqual(lane.label, "Test");
    });

    it("ProcessorRun type exists", () => {
      const run: ProcessorRun = {
        processor_id: "test",
        runtime: "local",
        ok: true,
        source: { kind: "observation" },
        view_drafts: 1,
        views_written: [],
        diagnostics: {},
      };
      assert.strictEqual(run.ok, true);
    });
  });

  describe("api client helpers (existence only)", () => {
    it("api module exports new helpers without crash", async () => {
      // The api module accesses import.meta.env on load, which will fail in Node.
      // We verify the module structure by reading the source.
      const fs = await import("node:fs");
      const source = fs.readFileSync("./apps/ui/src/api.ts", "utf-8");
      assert.ok(source.includes("export async function fetchMemoryCandidates"));
      assert.ok(source.includes("export async function fetchMemoryGateViews"));
      assert.ok(source.includes("export async function fetchProjectCurrentViews"));
      assert.ok(source.includes("export async function fetchWorkFocusSetViews"));
      assert.ok(source.includes("export async function fetchProcessorTraces"));
      assert.ok(source.includes("export async function fetchProactiveSuggestions"));
    });
  });

  describe("components import and export correctly", () => {
    it("ViewExplorer component exists", async () => {
      const fs = await import("node:fs");
      const source = fs.readFileSync("./apps/ui/src/components/ViewExplorer.tsx", "utf-8");
      assert.ok(source.includes("export default function ViewExplorer"));
    });

    it("MemoryReviewInbox component exists", async () => {
      const fs = await import("node:fs");
      const source = fs.readFileSync("./apps/ui/src/components/MemoryReviewInbox.tsx", "utf-8");
      assert.ok(source.includes("export default function MemoryReviewInbox"));
    });

    it("ProjectDashboard component exists", async () => {
      const fs = await import("node:fs");
      const source = fs.readFileSync("./apps/ui/src/components/ProjectDashboard.tsx", "utf-8");
      assert.ok(source.includes("export default function ProjectDashboard"));
    });

    it("ProcessorTracesPanel component exists", async () => {
      const fs = await import("node:fs");
      const source = fs.readFileSync("./apps/ui/src/components/ProcessorTracesPanel.tsx", "utf-8");
      assert.ok(source.includes("export default function ProcessorTracesPanel"));
    });

    it("ProactiveInbox component exists", async () => {
      const fs = await import("node:fs");
      const source = fs.readFileSync("./apps/ui/src/components/ProactiveInbox.tsx", "utf-8");
      assert.ok(source.includes("export default function ProactiveInbox"));
    });
  });
});
