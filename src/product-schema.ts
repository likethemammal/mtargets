/**
 * Product schema v0.2 — detect, normalize (v0.1 → v0.2), and validate.
 * @category ProductSchema
 */

import {
  PRODUCT_SCHEMA_ID,
  type NormalizedProductMetric,
  type NormalizedProductSpec,
  type ProductCategory,
  type ProductDirection,
  type ProductMetric,
  type ProductMetricSource,
  type ProductPercentile,
  type ProductRouteOverride,
  type ProductSpecDoc,
  type ProductTiers,
} from "./product-types.js";
import type { ValidationIssue, ValidationResult } from "./validate.js";

const PERCENTILES = ["p75", "p95", "p50", "median"] as const;
const METRIC_SOURCES = ["rum", "synthetic", "custom", "server"] as const;
const CATEGORIES = [
  "cwv",
  "perf",
  "generation",
  "ux",
  "error",
  "network",
] as const;
const DIRECTIONS = ["lower-is-better", "higher-is-better"] as const;

function err(path: string, message: string): ValidationIssue {
  return { path, message, severity: "error" };
}

function warn(path: string, message: string): ValidationIssue {
  return { path, message, severity: "warning" };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function includes<T extends string>(list: readonly T[], v: unknown): v is T {
  return isString(v) && (list as readonly string[]).includes(v);
}

/**
 * True when `input` looks like a product schema file (not MetricSuite).
 * Heuristic: has `name` + (`metrics`|`targets`) and no mtargets/v1 `kind`.
 * @category ProductSchema
 */
export function isProductSpec(input: unknown): input is ProductSpecDoc {
  if (!isRecord(input)) return false;
  if (input.kind !== undefined || input.apiVersion !== undefined) return false;
  if (!isString(input.name) || !input.name) return false;
  return isRecord(input.metrics) || isRecord(input.targets);
}

function resolveTiersFromLegacy(
  raw: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): ProductTiers | undefined {
  const tiersRaw = raw.tiers;
  let good: number | undefined;
  let warnVal: number | undefined;

  if (tiersRaw !== undefined) {
    if (!isRecord(tiersRaw)) {
      issues.push(err(`${path}.tiers`, "tiers must be an object"));
    } else {
      if (tiersRaw.good !== undefined) {
        if (typeof tiersRaw.good !== "number" || Number.isNaN(tiersRaw.good)) {
          issues.push(err(`${path}.tiers.good`, "must be a number"));
        } else {
          good = tiersRaw.good;
        }
      }
      if (tiersRaw.warn !== undefined) {
        if (typeof tiersRaw.warn !== "number" || Number.isNaN(tiersRaw.warn)) {
          issues.push(err(`${path}.tiers.warn`, "must be a number"));
        } else {
          warnVal = tiersRaw.warn;
        }
      }
    }
  }

  // Legacy v0.1: target → tiers.good, warning → tiers.warn
  if (good === undefined && raw.target !== undefined) {
    if (typeof raw.target !== "number" || Number.isNaN(raw.target)) {
      issues.push(err(`${path}.target`, "must be a number"));
    } else {
      good = raw.target;
    }
  }
  if (warnVal === undefined && raw.warning !== undefined) {
    if (typeof raw.warning !== "number" || Number.isNaN(raw.warning)) {
      issues.push(err(`${path}.warning`, "must be a number"));
    } else {
      warnVal = raw.warning;
    }
  }

  if (good === undefined) {
    issues.push(
      err(
        path,
        "tiers.good is required (or legacy target field for v0.1 files)",
      ),
    );
    return undefined;
  }

  const tiers: ProductTiers = { good };
  if (warnVal !== undefined) tiers.warn = warnVal;
  return tiers;
}

type NormalizedRouteOverride = NonNullable<
  NormalizedProductMetric["per_route"]
>[string];

function normalizeRouteOverride(
  raw: unknown,
  path: string,
  parentTiers: ProductTiers,
  issues: ValidationIssue[],
): NormalizedRouteOverride | undefined {
  if (!isRecord(raw)) {
    issues.push(err(path, "per_route entry must be an object"));
    return undefined;
  }

  const hasTierFields =
    raw.tiers !== undefined ||
    raw.target !== undefined ||
    raw.warning !== undefined;

  let effective: ProductTiers;
  if (hasTierFields) {
    const tiers = resolveTiersFromLegacy(raw, path, issues);
    if (!tiers) return undefined;
    effective = tiers;
  } else {
    effective = {
      good: parentTiers.good,
      ...(parentTiers.warn !== undefined ? { warn: parentTiers.warn } : {}),
    };
  }

  if (raw.baseline !== undefined && typeof raw.baseline !== "number") {
    issues.push(err(`${path}.baseline`, "must be a number"));
  }
  if (
    raw.percentile !== undefined &&
    !includes(PERCENTILES, raw.percentile)
  ) {
    issues.push(
      err(
        `${path}.percentile`,
        `must be one of ${PERCENTILES.join(", ")}`,
      ),
    );
  }
  if (
    raw.direction !== undefined &&
    !includes(DIRECTIONS, raw.direction)
  ) {
    issues.push(
      err(
        `${path}.direction`,
        `must be one of ${DIRECTIONS.join(", ")}`,
      ),
    );
  }

  return {
    tiers: effective,
    ...(typeof raw.baseline === "number" ? { baseline: raw.baseline } : {}),
    ...(includes(PERCENTILES, raw.percentile)
      ? { percentile: raw.percentile }
      : {}),
    ...(includes(DIRECTIONS, raw.direction)
      ? { direction: raw.direction }
      : {}),
  };
}

function normalizeMetric(
  raw: unknown,
  path: string,
  suiteKeys: Set<string> | null,
  issues: ValidationIssue[],
): NormalizedProductMetric | undefined {
  if (!isRecord(raw)) {
    issues.push(err(path, "metric must be an object"));
    return undefined;
  }

  const tiers = resolveTiersFromLegacy(raw, path, issues);
  if (!tiers) return undefined;

  if (raw.category !== undefined && !includes(CATEGORIES, raw.category)) {
    issues.push(
      err(`${path}.category`, `must be one of ${CATEGORIES.join(", ")}`),
    );
  }
  if (raw.percentile !== undefined && !includes(PERCENTILES, raw.percentile)) {
    issues.push(
      err(
        `${path}.percentile`,
        `must be one of ${PERCENTILES.join(", ")}`,
      ),
    );
  }
  if (raw.source !== undefined && !includes(METRIC_SOURCES, raw.source)) {
    issues.push(
      err(
        `${path}.source`,
        `must be one of ${METRIC_SOURCES.join(", ")}`,
      ),
    );
  }
  if (raw.direction !== undefined && !includes(DIRECTIONS, raw.direction)) {
    issues.push(
      err(
        `${path}.direction`,
        `must be one of ${DIRECTIONS.join(", ")}`,
      ),
    );
  }
  if (raw.baseline !== undefined && typeof raw.baseline !== "number") {
    issues.push(err(`${path}.baseline`, "must be a number"));
  }
  if (raw.unit !== undefined && !isString(raw.unit)) {
    issues.push(err(`${path}.unit`, "must be a string"));
  }
  if (raw.suite !== undefined) {
    if (!isString(raw.suite)) {
      issues.push(err(`${path}.suite`, "must be a string"));
    } else if (suiteKeys && suiteKeys.size > 0 && !suiteKeys.has(raw.suite)) {
      issues.push(
        warn(
          `${path}.suite`,
          `suite "${raw.suite}" is not declared in top-level suites`,
        ),
      );
    }
  }
  if (raw.critical !== undefined) {
    if (typeof raw.critical !== "number") {
      issues.push(err(`${path}.critical`, "must be a number"));
    } else {
      issues.push(
        warn(
          `${path}.critical`,
          "legacy critical is ignored in v0.2; values beyond tiers.warn are fail",
        ),
      );
    }
  }

  // Direction consistency with tiers
  if (
    tiers.warn !== undefined &&
    includes(DIRECTIONS, raw.direction ?? "lower-is-better")
  ) {
    const dir = (raw.direction ?? "lower-is-better") as ProductDirection;
    if (dir === "lower-is-better" && tiers.warn < tiers.good) {
      issues.push(
        err(
          `${path}.tiers`,
          "for lower-is-better, warn must be >= good",
        ),
      );
    }
    if (dir === "higher-is-better" && tiers.warn > tiers.good) {
      issues.push(
        err(
          `${path}.tiers`,
          "for higher-is-better, warn must be <= good",
        ),
      );
    }
  }

  let per_route: NormalizedProductMetric["per_route"];
  if (raw.per_route !== undefined) {
    if (!isRecord(raw.per_route)) {
      issues.push(err(`${path}.per_route`, "must be an object"));
    } else {
      per_route = {};
      for (const [route, override] of Object.entries(raw.per_route)) {
        const normalized = normalizeRouteOverride(
          override,
          `${path}.per_route[${JSON.stringify(route)}]`,
          tiers,
          issues,
        );
        if (normalized) per_route[route] = normalized;
      }
    }
  }

  const label =
    (isString(raw.label) && raw.label) ||
    (isString(raw.description) && raw.description) ||
    undefined;

  const metric: NormalizedProductMetric = {
    tiers,
    direction: includes(DIRECTIONS, raw.direction)
      ? raw.direction
      : "lower-is-better",
  };
  if (label) metric.label = label;
  if (includes(CATEGORIES, raw.category)) {
    metric.category = raw.category as ProductCategory;
  }
  if (isString(raw.unit)) metric.unit = raw.unit;
  if (includes(PERCENTILES, raw.percentile)) {
    metric.percentile = raw.percentile as ProductPercentile;
  }
  if (includes(METRIC_SOURCES, raw.source)) {
    metric.source = raw.source as ProductMetricSource;
  }
  if (isString(raw.collect)) metric.collect = raw.collect;
  if (isString(raw.suite)) metric.suite = raw.suite;
  if (typeof raw.baseline === "number") metric.baseline = raw.baseline;
  if (isString(raw.note)) metric.note = raw.note;
  if (per_route && Object.keys(per_route).length > 0) {
    metric.per_route = per_route;
  }

  return metric;
}

/**
 * Normalize a raw product document (v0.1 or v0.2) into canonical v0.2 shape.
 * Collects validation issues; returns null when fatal structure errors exist.
 * @category ProductSchema
 */
export function normalizeProductSpec(
  input: unknown,
): { spec: NormalizedProductSpec | null; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    return {
      spec: null,
      issues: [err("$", "document must be an object")],
    };
  }

  if (!isString(input.name) || !input.name) {
    issues.push(err("name", "name is required"));
  }

  const metricsRaw = input.metrics ?? input.targets;
  if (!isRecord(metricsRaw)) {
    issues.push(
      err(
        "metrics",
        "metrics (or legacy targets) object is required",
      ),
    );
    return { spec: null, issues };
  }

  if (input.metrics === undefined && input.targets !== undefined) {
    issues.push(
      warn("targets", "legacy targets map; prefer metrics in v0.2"),
    );
  }

  let suiteKeys: Set<string> | null = null;
  if (input.suites !== undefined) {
    if (!isRecord(input.suites)) {
      issues.push(err("suites", "suites must be an object of string values"));
    } else {
      suiteKeys = new Set();
      for (const [k, v] of Object.entries(input.suites)) {
        if (!isString(v)) {
          issues.push(err(`suites.${k}`, "suite description must be a string"));
        } else {
          suiteKeys.add(k);
        }
      }
    }
  }

  const metrics: Record<string, NormalizedProductMetric> = {};
  const entries = Object.entries(metricsRaw);
  if (entries.length < 1) {
    issues.push(err("metrics", "at least one metric is required"));
  }

  const mapName = input.metrics !== undefined ? "metrics" : "targets";
  for (const [key, raw] of entries) {
    const normalized = normalizeMetric(
      raw,
      `${mapName}.${key}`,
      suiteKeys,
      issues,
    );
    if (normalized) metrics[key] = normalized;
  }

  if (!isString(input.name) || !input.name) {
    return { spec: null, issues };
  }

  const hasErrors = issues.some((i) => i.severity === "error");
  if (hasErrors) {
    return { spec: null, issues };
  }

  const spec: NormalizedProductSpec = {
    $schema: PRODUCT_SCHEMA_ID,
    name: input.name,
    metrics,
  };
  if (isString(input.version)) spec.version = input.version;
  if (isString(input.description)) spec.description = input.description;
  if (isString(input.source)) spec.source = input.source;
  if (isRecord(input.suites)) {
    const suites: Record<string, string> = {};
    for (const [k, v] of Object.entries(input.suites)) {
      if (isString(v)) suites[k] = v;
    }
    if (Object.keys(suites).length > 0) spec.suites = suites;
  }

  return { spec, issues };
}

/**
 * Validate a product schema document (v0.1 or v0.2).
 * @category ProductSchema
 */
export function validateProductSpec(input: unknown): ValidationResult {
  const { issues } = normalizeProductSpec(input);
  return {
    ok: !issues.some((i) => i.severity === "error"),
    issues,
  };
}

/**
 * Validate and return normalized v0.2 spec; throws on error issues.
 * @category ProductSchema
 */
export function assertValidProductSpec(input: unknown): NormalizedProductSpec {
  const { spec, issues } = normalizeProductSpec(input);
  if (!spec) {
    const msg = issues
      .filter((i) => i.severity === "error")
      .map((i) => `${i.path}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid product schema:\n${msg}`);
  }
  return spec;
}

/**
 * Resolve effective tiers for a metric, optionally for a route key.
 * Exact route match only (callers may implement glob matching later).
 * @category ProductSchema
 */
export function resolveProductTiers(
  metric: NormalizedProductMetric | ProductMetric,
  route?: string,
): ProductTiers {
  const base =
    metric.tiers ??
    (typeof (metric as ProductMetric).target === "number"
      ? {
          good: (metric as ProductMetric).target as number,
          ...((metric as ProductMetric).warning !== undefined
            ? { warn: (metric as ProductMetric).warning }
            : {}),
        }
      : undefined);

  if (!base || typeof base.good !== "number") {
    throw new Error("metric has no tiers.good / target");
  }

  if (!route || !metric.per_route?.[route]) {
    return { good: base.good, ...(base.warn !== undefined ? { warn: base.warn } : {}) };
  }

  const override = metric.per_route[route] as ProductRouteOverride & {
    tiers?: ProductTiers;
  };
  const ot = override.tiers;
  const good =
    ot?.good ??
    override.target ??
    base.good;
  const warnVal =
    ot?.warn ??
    override.warning ??
    base.warn;
  return {
    good,
    ...(warnVal !== undefined ? { warn: warnVal } : {}),
  };
}

/**
 * Enumerations exported for CLI / docs consumers.
 * @category ProductSchema
 */
export const PRODUCT_PERCENTILES = PERCENTILES;
/** @category ProductSchema */
export const PRODUCT_METRIC_SOURCES = METRIC_SOURCES;
/** @category ProductSchema */
export const PRODUCT_CATEGORIES = CATEGORIES;
/** @category ProductSchema */
export const PRODUCT_DIRECTIONS = DIRECTIONS;
