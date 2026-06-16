import type { ContextQuery, ContextView } from "@info/core";

export type ViewLifecycle = "ephemeral" | "session" | "project" | "long_term";

export type ViewProducerKind = "processor" | "agent" | "manual" | "runtime" | "legacy";

export type ViewSubjectSpec = {
  description?: string;
  examples?: Array<Record<string, unknown>>;
};

export type ViewProducerSpec = {
  id: string;
  kind: ViewProducerKind;
  description?: string;
};

export type ViewConsumptionSpec = {
  observations?: string[];
  views?: string[];
};

export type ViewSpec = {
  view_type: string;
  title: string;
  purpose: string;
  lifecycle: ViewLifecycle;
  subject?: ViewSubjectSpec;
  producers?: ViewProducerSpec[];
  consumes?: ViewConsumptionSpec;
  content_schema?: unknown;
  examples?: Array<Partial<ContextView> & { view_type?: string }>;
  default_query?: Partial<ContextQuery>;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

export type LegacyViewFamilyDefinition = {
  view_type: string;
  label: string;
  purpose: string;
  category?: string;
  producers?: string[];
  default_page_size?: number;
  manual_create?: boolean;
};

export function namespaceOf(viewType: string): string {
  const index = viewType.indexOf(".");
  return index > 0 ? viewType.slice(0, index) : viewType;
}

export function normalizeViewSpec(spec: ViewSpec): ViewSpec {
  return {
    ...spec,
    view_type: spec.view_type.trim(),
    tags: [...new Set(spec.tags ?? [])].sort(),
  };
}

export function legacyViewFamilyToSpec(definition: LegacyViewFamilyDefinition): ViewSpec {
  return normalizeViewSpec({
    view_type: definition.view_type,
    title: definition.label,
    purpose: definition.purpose,
    lifecycle: lifecycleForLegacyCategory(definition.category),
    producers: (definition.producers ?? []).map(producer => ({
      id: `legacy.${producer}`,
      kind: "legacy",
    })),
    default_query: {
      view_types: [definition.view_type],
      limit: definition.default_page_size,
    },
    tags: ["legacy", definition.category].filter((tag): tag is string => Boolean(tag)),
    metadata: {
      legacy_category: definition.category,
      manual_create: definition.manual_create ?? false,
    },
  });
}

function lifecycleForLegacyCategory(category?: string): ViewLifecycle {
  if (category === "memory") return "long_term";
  if (category === "runtime" || category === "ambient") return "session";
  if (category === "project") return "project";
  return "session";
}
