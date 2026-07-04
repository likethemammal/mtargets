/**
 * Interop: import OpenSLO, Lighthouse budget.json, and k6-like thresholds
 * into MetricSuite documents.
 */
import { API_VERSION, type MetricSuiteDoc, type Objective, type Op } from "./types.js";

function idify(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "imported";
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** Minimal OpenSLO document shape (SLO kind). @category Interop */
export interface OpenSloLike {
  apiVersion?: string;
  kind?: string;
  metadata?: { name?: string; displayName?: string; labels?: Record<string, string> };
  spec?: Record<string, unknown>;
}

/**
 * Convert an OpenSLO SLO document into a MetricSuite (best-effort).
 * @category Interop
 */
export function importOpenSlo(doc: OpenSloLike): MetricSuiteDoc {
  const meta = doc.metadata ?? {};
  const spec = doc.spec ?? {};
  const name = meta.name ?? "openslo-import";
  const service = typeof spec.service === "string" ? spec.service : "service";

  const indicatorId = "sli";
  const objectives: Objective[] = [];

  const objs = Array.isArray(spec.objectives) ? spec.objectives : [];
  const indicatorSpec = asRecord(spec.indicator)?.spec ?? asRecord(spec.indicator);
  const threshold = asRecord(indicatorSpec)?.thresholdMetric;
  const ratio = asRecord(indicatorSpec)?.ratioMetric;

  let source: Record<string, unknown> = { type: "promql", query: "openslo" };
  if (asRecord(threshold)) {
    const ms = asRecord(asRecord(threshold)?.metricSource);
    source = {
      type: typeof ms?.type === "string" ? ms.type.toLowerCase() : "promql",
      query: asRecord(ms?.spec)?.query ?? ms?.spec ?? "threshold",
    };
  } else if (asRecord(ratio)) {
    const r = asRecord(ratio)!;
    const good = asRecord(asRecord(r.good)?.metricSource);
    const bad = asRecord(asRecord(r.bad)?.metricSource);
    const total = asRecord(asRecord(r.total)?.metricSource);
    const raw = asRecord(asRecord(r.raw)?.metricSource);
    source = {
      type: "promql",
      ...(good
        ? { good: asRecord(good.spec)?.query ?? good.spec }
        : {}),
      ...(bad ? { bad: asRecord(bad.spec)?.query ?? bad.spec } : {}),
      ...(total
        ? { total: asRecord(total.spec)?.query ?? total.spec }
        : {}),
      ...(raw
        ? {
            query: asRecord(raw.spec)?.query ?? raw.spec,
            rawType: r.rawType === "failure" ? "failure" : "success",
          }
        : {}),
    };
  }

  for (let i = 0; i < objs.length; i++) {
    const o = asRecord(objs[i]);
    if (!o) continue;
    const target =
      typeof o.target === "number"
        ? o.target
        : typeof o.targetPercent === "number"
          ? o.targetPercent / 100
          : 0.99;
    const op = (typeof o.op === "string" ? o.op : "gte") as Op;
    const value =
      typeof o.value === "number"
        ? o.value
        : target; /* availability-style: gte target on ratio */
    const id = idify(
      typeof o.displayName === "string" ? o.displayName : `objective-${i + 1}`,
    );
    const tw = Array.isArray(spec.timeWindow) ? asRecord(spec.timeWindow[0]) : null;
    const window =
      typeof tw?.duration === "string"
        ? tw.duration
        : "30d";
    const budgetingMethod =
      typeof spec.budgetingMethod === "string"
        ? spec.budgetingMethod
        : "Occurrences";

    objectives.push({
      id,
      title: typeof o.displayName === "string" ? o.displayName : id,
      indicator: indicatorId,
      op: typeof o.value === "number" ? op : "gte",
      value: typeof o.value === "number" ? value : target,
      severity: "error",
      target: typeof o.value === "number" ? undefined : target,
      errorBudget: {
        budgetingMethod: budgetingMethod as "Occurrences",
        target,
        window,
      },
    });
  }

  if (objectives.length === 0) {
    objectives.push({
      id: "slo-target",
      indicator: indicatorId,
      op: "gte",
      value: 0.99,
      severity: "error",
      target: 0.99,
      errorBudget: {
        budgetingMethod: "Occurrences",
        target: 0.99,
        window: "30d",
      },
    });
  }

  return {
    apiVersion: API_VERSION,
    kind: "MetricSuite",
    metadata: {
      id: idify(name),
      title: meta.displayName ?? name,
      labels: { ...(meta.labels ?? {}), importedFrom: "openslo" },
    },
    spec: {
      intent: typeof spec.description === "string" ? spec.description : undefined,
      subjects: [{ id: idify(service), type: "service", title: service }],
      indicators: [
        {
          id: indicatorId,
          kind: ratio || threshold ? (ratio ? "ratio" : "gauge") : "ratio",
          unit: "1",
          subjectRef: idify(service),
          source: source as unknown as MetricSuiteDoc["spec"]["indicators"][0]["source"],
          window: "30d",
        },
      ],
      objectives,
    },
  };
}

/** Lighthouse budget.json entry (simplified). @category Interop */
export interface LighthouseBudget {
  path?: string;
  timings?: Array<{ metric: string; budget: number }>;
  resourceSizes?: Array<{ resourceType: string; budget: number }>;
  resourceCounts?: Array<{ resourceType: string; budget: number }>;
}

/**
 * Convert Lighthouse budget.json array into a MetricSuite.
 * @category Interop
 */
export function importBudgetJson(
  budgets: LighthouseBudget[],
  options: { id?: string; title?: string } = {},
): MetricSuiteDoc {
  const indicators: MetricSuiteDoc["spec"]["indicators"] = [];
  const objectives: Objective[] = [];
  const seen = new Set<string>();

  for (const b of budgets) {
    const pathLabel = b.path ?? "/*";
    for (const t of b.timings ?? []) {
      const id = idify(`timing-${t.metric}-${pathLabel}`);
      if (seen.has(id)) continue;
      seen.add(id);
      indicators.push({
        id,
        kind: "timing",
        unit: "ms",
        higherIsWorse: true,
        subjectRef: "page",
        source: {
          type: "lighthouse",
          query: t.metric,
          params: { path: pathLabel },
        },
        aggregate: "p75",
      });
      objectives.push({
        id: idify(`obj-${id}`),
        indicator: id,
        op: "lte",
        value: t.budget,
        severity: "error",
      });
    }
    for (const r of b.resourceSizes ?? []) {
      const id = idify(`size-${r.resourceType}-${pathLabel}`);
      if (seen.has(id)) continue;
      seen.add(id);
      indicators.push({
        id,
        kind: "gauge",
        unit: "KiB",
        higherIsWorse: true,
        subjectRef: "page",
        source: {
          type: "resource-budget",
          query: r.resourceType,
          params: { path: pathLabel, measure: "size" },
        },
      });
      objectives.push({
        id: idify(`obj-${id}`),
        indicator: id,
        op: "lte",
        value: r.budget,
        severity: "error",
      });
    }
    for (const r of b.resourceCounts ?? []) {
      const id = idify(`count-${r.resourceType}-${pathLabel}`);
      if (seen.has(id)) continue;
      seen.add(id);
      indicators.push({
        id,
        kind: "count",
        unit: "count",
        higherIsWorse: true,
        subjectRef: "page",
        source: {
          type: "resource-budget",
          query: r.resourceType,
          params: { path: pathLabel, measure: "count" },
        },
      });
      objectives.push({
        id: idify(`obj-${id}`),
        indicator: id,
        op: "lte",
        value: r.budget,
        severity: "error",
      });
    }
  }

  if (indicators.length === 0 || objectives.length === 0) {
    throw new Error("budget.json contained no timings/resourceSizes/resourceCounts");
  }

  return {
    apiVersion: API_VERSION,
    kind: "MetricSuite",
    metadata: {
      id: options.id ?? "lighthouse-budgets",
      title: options.title ?? "Lighthouse budgets",
      labels: { importedFrom: "budget.json" },
    },
    spec: {
      subjects: [{ id: "page", type: "surface", title: "Page" }],
      indicators,
      objectives,
    },
  };
}

/**
 * Import a k6-like thresholds map:
 * `{ "http_req_duration": ["p(95)<500", "p(99)<1000"], "checks": ["rate>0.99"] }`
 * @category Interop
 */
export function importK6Thresholds(
  thresholds: Record<string, string[]>,
  options: { id?: string; title?: string } = {},
): MetricSuiteDoc {
  const indicators: MetricSuiteDoc["spec"]["indicators"] = [];
  const objectives: Objective[] = [];

  const parseThresh = (
    expr: string,
  ): { aggregate?: string; op: Op; value: number } | null => {
    const m = /^(?:p\((\d+)\)|rate|value|avg|med|max|min)?\s*(<=|>=|<|>|==)\s*(\d+(?:\.\d+)?)$/i.exec(
      expr.replace(/\s+/g, ""),
    );
    if (!m) return null;
    const p = m[1];
    const opRaw = m[2];
    const value = Number(m[3]);
    const opMap: Record<string, Op> = {
      "<": "lt",
      "<=": "lte",
      ">": "gt",
      ">=": "gte",
      "==": "eq",
    };
    const op = opMap[opRaw!] ?? "lt";
    const aggregate = p ? `p${p}` : expr.toLowerCase().includes("rate") ? "pass_rate" : "avg";
    return { aggregate, op, value };
  };

  for (const [metric, exprs] of Object.entries(thresholds)) {
    const indId = idify(metric);
    indicators.push({
      id: indId,
      kind: metric.includes("duration") || metric.includes("waiting")
        ? "timing"
        : "gauge",
      unit: metric.includes("duration") ? "ms" : "1",
      higherIsWorse: !metric.includes("rate") && !metric.includes("checks"),
      subjectRef: "load",
      source: { type: "custom", query: metric, params: { importedFrom: "k6" } },
      aggregate: "p95",
    });
    for (let i = 0; i < exprs.length; i++) {
      const parsed = parseThresh(exprs[i]!);
      if (!parsed) continue;
      if (parsed.aggregate && parsed.aggregate.startsWith("p")) {
        const last = indicators[indicators.length - 1]!;
        last.aggregate = parsed.aggregate as "p95";
      }
      objectives.push({
        id: idify(`${indId}-${i + 1}`),
        indicator: indId,
        op: parsed.op,
        value: parsed.value,
        severity: "error",
      });
    }
  }

  if (indicators.length === 0 || objectives.length === 0) {
    throw new Error("k6 thresholds map produced no parseable thresholds");
  }

  return {
    apiVersion: API_VERSION,
    kind: "MetricSuite",
    metadata: {
      id: options.id ?? "k6-thresholds",
      title: options.title ?? "k6 thresholds",
      labels: { importedFrom: "k6" },
    },
    spec: {
      subjects: [{ id: "load", type: "flow", title: "Load test" }],
      indicators,
      objectives,
    },
  };
}
