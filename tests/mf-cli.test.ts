import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ContextStore } from "@info/core";

function withDb(fn: (dbPath: string, store: ContextStore) => void) {
  const dir = mkdtempSync(join(tmpdir(), "info-mf-cli-test-"));
  const dbPath = join(dir, "context.sqlite");
  const store = new ContextStore(dbPath);
  try {
    fn(dbPath, store);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function mf(dbPath: string, args: string[]) {
  return execFileSync("node", ["--experimental-sqlite", "--import", "tsx", "scripts/mf.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, CONTEXT_DB_PATH: dbPath },
    encoding: "utf8",
  });
}

test("mf processor list and report expose built-in processors", () => withDb((dbPath) => {
  const list = mf(dbPath, ["processor", "list"]);
  assert.match(list, /processor\.surface_state/);
  assert.match(list, /processor\.route_candidate/);
  assert.match(list, /runtime/);
  assert.match(list, /autonomy/);

  const report = mf(dbPath, ["processor", "report"]);
  assert.match(report, /warnings:/);
}));

test("mf view latest and trace inspect stored views", () => withDb((dbPath, store) => {
  const record = store.insertRecord({
    id: "obs:mf:source",
    schema: { name: "observation.ai_session_locator_result", version: 1 },
    source: { type: "ai_session" },
    content: { title: "Source observation" },
  });
  store.upsertView({
    id: "view:mf:focus",
    view_type: "work.focus_set",
    title: "Work Focus",
    status: "candidate",
    source_records: [record.id],
    compiler: { id: "processor.work_router_batch", mode: "deterministic" },
    content: { active_lanes: [] },
  });

  const latest = mf(dbPath, ["view", "latest", "work.focus_set"]);
  assert.match(latest, /work\.focus_set/);
  assert.match(latest, /view:mf:focus/);

  const trace = mf(dbPath, ["view", "trace", "view:mf:focus"]);
  assert.match(trace, /compiler: processor\.work_router_batch deterministic/);
  assert.match(trace, /source_records: obs:mf:source/);
  assert.match(trace, /record obs:mf:source: observation\.ai_session_locator_result Source observation/);
}));

test("mf view trace returns non-zero for unknown view", () => withDb((dbPath) => {
  const result = spawnSync("node", ["--experimental-sqlite", "--import", "tsx", "scripts/mf.ts", "view", "trace", "missing"], {
    cwd: process.cwd(),
    env: { ...process.env, CONTEXT_DB_PATH: dbPath },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /View not found: missing/);
}));
