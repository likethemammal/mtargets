import type {
  AggregateInput,
  AggregateMethod,
  IndicatorKind,
  Op,
  Severity,
  SubjectType,
  WindowInput,
  WindowType,
} from "./types.js";

/** @category Constants */
export const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

/** @category Constants */
export const DOCUMENT_KINDS = [
  "MetricSuite",
  "MetricRun",
  "MetricCatalog",
  "MetricBinding",
] as const;

/** @category Constants */
export const SEVERITIES: Severity[] = ["info", "warn", "error"];

/** @category Constants */
export const OPS: Op[] = [
  "lt",
  "lte",
  "gt",
  "gte",
  "eq",
  "neq",
  "in",
  "not_in",
  "between",
];

/** @category Constants */
export const INDICATOR_KINDS: IndicatorKind[] = [
  "timing",
  "ratio",
  "gauge",
  "count",
  "score",
  "assertion",
  "histogram",
];

/** @category Constants */
export const SUBJECT_TYPES: SubjectType[] = [
  "surface",
  "service",
  "flow",
  "agent",
  "system",
  "component",
  "provider",
  "hook",
  "unit",
  "dataset",
];

/** @category Constants */
export const AGGREGATE_METHODS: AggregateMethod[] = [
  "p50",
  "p75",
  "p90",
  "p95",
  "p99",
  "avg",
  "min",
  "max",
  "sum",
  "last",
  "rate",
  "pass_rate",
  "pass_count",
  "fail_count",
];

/** @category Constants */
export const WINDOW_TYPES: WindowType[] = [
  "rolling",
  "calendar",
  "run",
  "ci",
  "custom",
];

/**
 * Recommended source.type registry (open — runners may add more).
 * See docs/guide/integrations.md for adapter contracts per type.
 * @category Constants
 */
export const RECOMMENDED_SOURCE_TYPES = [
  "web-vitals",
  "lighthouse",
  "resource-budget",
  "promql",
  "logql",
  "traceql",
  "events",
  "http",
  "sentry",
  "glitchtip",
  "datadog",
  "newrelic",
  "usage",
  "eval-suite",
  "test-report",
  "sql",
  "custom",
  "script",
  "manual",
  "composite",
] as const;

/**
 * Duration shorthand: 5m, 1h, 24h, 7d, 28d, 30d, or bare calendar tokens.
 * @category Constants
 */
export const DURATION_SHORTHAND =
  /^(?:\d+(?:\.\d+)?(?:ms|s|m|h|d|w)|day|week|month)$/;

/** @category Constants */
export function isAggregateMethod(v: unknown): v is AggregateMethod {
  return typeof v === "string" && (AGGREGATE_METHODS as string[]).includes(v);
}

/** @category Constants */
export function normalizeAggregate(
  input: AggregateInput | undefined,
): { method: AggregateMethod; percentile?: number } | undefined {
  if (input === undefined) return undefined;
  if (typeof input === "string") return { method: input };
  return input;
}

/** @category Constants */
export function normalizeWindow(
  input: WindowInput | undefined,
):
  | {
      type: WindowType;
      duration?: string;
      calendar?: string;
      timezone?: string;
      anchor?: string;
    }
  | undefined {
  if (input === undefined) return undefined;
  if (typeof input === "string") {
    if (input === "run" || input === "ci") {
      return { type: input };
    }
    if (input === "day" || input === "week" || input === "month") {
      return { type: "calendar", calendar: input };
    }
    return { type: "rolling", duration: input };
  }
  return input;
}

/** @category Constants */
export function includesEnum<T extends string>(
  list: readonly T[],
  value: unknown,
): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}
