import { ContextStore, filterViewsByQuery, type StoredContextView } from "@info/core";
import { builtinViewSpecs, createViewRegistry, searchViewSpecs, type ViewSpec } from "@info/view-system";

const registry = createViewRegistry(builtinViewSpecs());
const store = new ContextStore();

async function main(argv: string[]): Promise<void> {
  const [area, command, ...rest] = argv;
  if (area !== "view") {
    printHelp();
    return;
  }

  if (command === "list") {
    printViewList(registry.list());
    return;
  }

  if (command === "show") {
    const viewType = required(rest[0], "view_type");
    printViewShow(viewType);
    return;
  }

  if (command === "json") {
    const viewType = required(rest[0], "view_type");
    printViewJson(viewType);
    return;
  }

  if (command === "search") {
    const query = required(rest.join(" "), "query");
    printViewSearch(query);
    return;
  }

  printHelp();
}

function printViewList(specs: ViewSpec[]): void {
  const rows = specs.map(spec => ({
    view_type: spec.view_type,
    lifecycle: spec.lifecycle,
    producers: (spec.producers ?? []).map(producer => producer.id).join(",") || "-",
    purpose: spec.purpose,
  }));
  printTable(rows, ["view_type", "lifecycle", "producers", "purpose"]);
}

function printViewShow(viewType: string): void {
  const spec = registry.get(viewType);
  const latest = store.listViews({ view_types: [viewType], active_only: true, limit: 5 });

  if (!spec) {
    console.log(`View spec not found: ${viewType}`);
  } else {
    console.log(`${spec.view_type}`);
    console.log(`  title: ${spec.title}`);
    console.log(`  lifecycle: ${spec.lifecycle}`);
    console.log(`  producers: ${(spec.producers ?? []).map(producer => `${producer.id}:${producer.kind}`).join(", ") || "-"}`);
    console.log(`  purpose: ${spec.purpose}`);
    if (spec.subject?.description) console.log(`  subject: ${spec.subject.description}`);
  }

  if (!latest.length) {
    console.log("  latest views: none");
    return;
  }

  console.log("  latest views:");
  for (const view of latest) {
    console.log(`  - ${view.id} ${view.status ?? "candidate"} ${view.updated_at}`);
    if (view.title) console.log(`    ${view.title}`);
    if (view.summary) console.log(`    ${view.summary}`);
  }
}

function printViewJson(viewType: string): void {
  const spec = registry.get(viewType);
  const latest = store.listViews({ view_types: [viewType], active_only: true, limit: 5 });
  console.log(JSON.stringify({ spec, latest }, null, 2));
}

function printViewSearch(query: string): void {
  const specs = searchViewSpecs(registry.list(), query);
  const views = filterViewsByQuery(store.listViews({ active_only: true, limit: 100 }), query).slice(0, 20);
  console.log("Specs");
  printViewList(specs);
  console.log("");
  console.log("Stored views");
  if (!views.length) {
    console.log("  none");
    return;
  }
  for (const view of views) printStoredViewLine(view);
}

function printStoredViewLine(view: StoredContextView): void {
  console.log(`  ${view.view_type} ${view.id} ${view.updated_at} ${view.title ?? ""}`.trim());
}

function printHelp(): void {
  console.log(`Usage:
  pnpm mf view list
  pnpm mf view show <view_type>
  pnpm mf view json <view_type>
  pnpm mf view search <query>`);
}

function printTable(rows: Array<Record<string, string>>, columns: string[]): void {
  if (!rows.length) {
    console.log("  none");
    return;
  }
  const widths = Object.fromEntries(columns.map(column => [
    column,
    Math.max(column.length, ...rows.map(row => String(row[column] ?? "").length)),
  ]));
  console.log(columns.map(column => column.padEnd(widths[column])).join("  "));
  console.log(columns.map(column => "-".repeat(widths[column])).join("  "));
  for (const row of rows) {
    console.log(columns.map(column => String(row[column] ?? "").padEnd(widths[column])).join("  "));
  }
}

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

main(process.argv.slice(2)).catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
