import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

test("default dev entrypoint uses the policy-aware HTTP server", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> };
  const readme = readFileSync("README.md", "utf8");

  assert.match(pkg.scripts?.dev ?? "", /src\/server\/http-server\.ts/);
  assert.match(pkg.scripts?.["iii:worker"] ?? "", /src\/server\/worker\.ts/);
  assert.match(readme, /pnpm run dev[\s\S]*默认地址：`http:\/\/localhost:3111`/);
  assert.match(readme, /pnpm run iii:worker/);
});

test("runtime no longer routes candidate WorkThreads through episode Records", () => {
  const files = [
    "src/runtime/runtime.ts",
    "src/runtime/work-thread-view.ts",
    "src/runtime/correlation.ts",
  ];

  for (const file of files) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /episode\.candidate_thread/, file);
  }
});

test("docs describe current View-based runtime outputs", () => {
  const docs = [
    "README.md",
    "docs/context-pipeline-runtime.md",
    "docs/context-runtime-design.md",
    "docs/info-ambient-runtime-architecture.md",
    "docs/info-design-consensus.md",
    "docs/info-runtime-implementation-plan.md",
  ];

  for (const file of docs) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /写入 `episode\.candidate_thread`/, file);
    assert.doesNotMatch(text, /写入 `episode\.thread_interpretation`/, file);
    assert.doesNotMatch(text, /写入 `episode\.project_work`/, file);
    assert.doesNotMatch(text, /derived\.content_classification/, file);
    assert.doesNotMatch(text, /derived\.reader_snapshot/, file);
    assert.doesNotMatch(text, /derived\.[a-z_]+/, file);
  }
});

test("README documents browser extension as sensor/View reader, not direct agent orchestrator", () => {
  const readme = readFileSync("README.md", "utf8");

  assert.match(readme, /Ambient Explore 写入 `\/context\/ingest\?process=true&cascade_views=true`/);
  assert.match(readme, /扩展本身只读取 Views 和写 feedback/);
});

test("docs do not present direct Claude ACP as the primary agent boundary", () => {
  const docs = [
    "docs/info-ambient-runtime-architecture.md",
    "docs/info-design-consensus.md",
    "docs/info-runtime-implementation-plan.md",
  ];

  for (const file of docs) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /capability\.agent\.claude_acp/, file);
    assert.doesNotMatch(text, /claude_acp/, file);
    assert.match(text, /capability\.agent_task\.submit/, file);
  }
});

test("docs keep Browser Ambient on the generic AgentTask boundary", () => {
  const docs = [
    "docs/context-pipeline-runtime.md",
    "docs/context-runtime-design.md",
    "docs/info-ambient-runtime-architecture.md",
    "docs/info-design-consensus.md",
    "docs/info-runtime-implementation-plan.md",
  ];

  for (const file of docs) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /Browser Ambient Program[\s\S]{0,160}capability\.github\.inspect_repo/, file);
    assert.doesNotMatch(text, /program\.browser_ambient[\s\S]{0,160}capability\.pdf\.extract_text/, file);
    assert.doesNotMatch(text, /program\.browser_ambient[\s\S]{0,160}capability\.github\.inspect_repo/, file);
    assert.doesNotMatch(text, /program\.browser_ambient[\s\S]{0,200}capability\.agent\.claude_acp/, file);
    assert.doesNotMatch(text, /Browser Ambient[\s\S]{0,200}capability\.agent\.claude_acp/, file);
  }
});

test("docs mark PDF GitHub code skills as plugin or explicit capabilities, not default runtime", () => {
  const docs = [
    "docs/info-runtime-implementation-plan.md",
    "docs/context-runtime-design.md",
    "docs/context-pipeline-runtime.md",
    "docs/ambient-context-runtime.md",
  ];

  for (const file of docs) {
    const text = readFileSync(file, "utf8");
    assert.match(text, /plugin|explicit|installed|not default|不是默认|可安装/i, file);
  }
  assert.match(readFileSync("docs/info-runtime-implementation-plan.md", "utf8"), /Default runtime capabilities stay small/);
});

test("Claude Code AgentTask adapter does not disable external runtime tools", () => {
  const text = readFileSync("src/programs/capabilities/agent-task-submit.ts", "utf8");

  assert.doesNotMatch(text, /--tools",\s*""/);
  assert.match(text, /tools:\s*"default"/);
  assert.match(text, /--dangerously-skip-permissions/);
  assert.doesNotMatch(text, /--allowedTools/);
  assert.doesNotMatch(text, /--disallowedTools/);
});

test("Browser Ambient does not call Claude directly outside the generic AgentTask boundary", () => {
  const text = readFileSync("src/programs/builtins/browser-ambient.ts", "utf8");

  assert.match(text, /capability\.agent_task\.submit/);
  assert.doesNotMatch(text, /runClaudeBrowserAmbient/);
  assert.doesNotMatch(text, /runClaudeAcpBrowserAmbient/);
});

test("legacy direct Claude agent adapters are not kept as alternate runtimes", () => {
  assert.equal(existsSync("src/agents/claude-code.ts"), false);
  assert.equal(existsSync("src/agents/claude-acp.ts"), false);
  assert.equal(existsSync("src/programs/capabilities/agent-claude-acp.ts"), false);
});

test("PDF GitHub and code skills are not core capability files", () => {
  assert.equal(existsSync("src/programs/capabilities/pdf-extract-text.ts"), false);
  assert.equal(existsSync("src/programs/capabilities/github-inspect-repo.ts"), false);
  assert.equal(existsSync("src/programs/capabilities/github-inspect-issue.ts"), false);
  assert.equal(existsSync("src/programs/capabilities/code-inspect-project.ts"), false);
});

test("Browser Ambient metadata and docs prefer AgentTask output with deterministic fallback", () => {
  const source = readFileSync("src/programs/builtins/browser-ambient.ts", "utf8");
  const docs = [
    "docs/info-runtime-implementation-plan.md",
    "docs/info-ambient-runtime-architecture.md",
    "docs/info-design-consensus.md",
  ];

  assert.match(source, /produces:\s*\["analysis\.browser_agent_task",\s*"analysis\.browser_page"\]/);
  assert.match(source, /fallback_used:\s*false/);
  assert.match(source, /fallback_used:\s*true/);

  for (const file of docs) {
    const text = readFileSync(file, "utf8");
    assert.match(text, /analysis\.browser_agent_task/, file);
    assert.match(text, /fallback|回退|兜底/i, file);
  }
});

test("Browser Ambient AgentTask stays analysis-only in local task prompt", () => {
  const source = readFileSync("src/programs/builtins/browser-ambient.ts", "utf8");
  const plan = readFileSync("docs/info-runtime-implementation-plan.md", "utf8");

  assert.match(source, /Do not modify files\. Do not return next_actions, tasks, tool plans, or file diffs\./);
  assert.match(source, /opencli youtube transcript <url> --mode raw -f json/);
  assert.match(source, /Do not perform account-changing actions/);
  assert.doesNotMatch(source, /Do not propose next actions unless/);
  assert.doesNotMatch(plan, /GET recent analysis\.browser_page Views/);
  assert.match(plan, /GET recent analysis\.browser_agent_task Views/);
});

test("Claude Code AgentTask prompt has no future action-output exception", () => {
  const text = readFileSync("src/programs/capabilities/agent-task-submit.ts", "utf8");

  assert.match(text, /This adapter produces analysis-only Views\. Do not return next_actions, tasks, tool plans, file diffs, or diffs\./);
  assert.doesNotMatch(text, /future output contract explicitly asks/);
});

test("Claude Code AgentTask has no default wall-clock timeout for local tool enrichment", () => {
  const text = readFileSync("src/programs/capabilities/agent-task-submit.ts", "utf8");

  assert.match(text, /Do not impose a default wall-clock timeout/);
  assert.match(text, /AGENT_TASK_CLAUDE_CODE_TIMEOUT_MS.*0/);
});
