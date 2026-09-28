/**
 * Product validate / baseline — compare actuals to tiers, write baselines.
 * Report shape matches SER-643 integration spec Part 3.
 * @category ProductValidate
 */

import type { ProductActual } from "./product-data.js";
import { resolveProductTiers } from "./product-schema.js";
import type {
  NormalizedProductMetric,
  NormalizedProductSpec,
  ProductDirection,
  ProductTiers,
} from "./product-types.js";

/** @category ProductValidate */
export type ProductResultStatus = "pass" | "warn" | "fail" | "noData";

/** One row in the agent-readable validate report. @category ProductValidate */
export interface ProductValidateResultRow {
  key: string;
  label?: string;
  suite?: string;
  route?: string;
  actual?: number;
  percentile?: string;
  tiers: ProductTiers;
  status: ProductResultStatus;
  delta_from_baseline?: number;
}

/** Structured validate report (Part 3). @category ProductValidate */
export interface ProductValidateReport {
  spec: string;
  evaluatedAt: string;
  dataSource: string;
  summary: {
    pass: number;
    warn: number;
    fail: number;
    noData: number;
  };
  results: ProductValidateResultRow[];
}

/** Options for product validate. @category ProductValidate */
export interface ProductValidateOptions {
  suite?: string;
  route?: string;
  evaluatedAt?: string;
  dataSource?: string;
}

/** Options for applying baselines. @category ProductValidate */
export interface ProductBaselineOptions {
  suite?: string;
  route?: string;
}

/**
 * Match a route pattern from the spec against an observed route.
 * Supports exact match and trailing `*` prefix globs (`/scheduling/sched-*`).
 * @category ProductValidate
 */
export function matchRoutePattern(pattern: string, route: string): boolean {
  if (pattern === route) return true;
  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1);
    return route.startsWith(prefix);
  }
  return false;
}

/**
 * Find the best matching per_route key for an observed route.
 * Prefers exact match, then longest matching glob prefix.
 * @category ProductValidate
 */
export function findMatchingRouteKey(
  metric: NormalizedProductMetric,
  route: string,
): string | undefined {
  const routes = metric.per_route;
  if (!routes) return undefined;
  if (routes[route]) return route;
  let best: string | undefined;
  let bestLen = -1;
  for (const pattern of Object.keys(routes)) {
    if (!matchRoutePattern(pattern, route)) continue;
    const len = pattern.endsWith("*") ? pattern.length - 1 : pattern.length;
    if (len > bestLen) {
      best = pattern;
      bestLen = len;
    }
  }
  return best;
}

/**
 * Compare an actual value against tiers using direction.
 * @category ProductValidate
 */
export function compareProductActual(
  actual: number,
  tiers: ProductTiers,
  direction: ProductDirection = "lower-is-better",
): Exclude<ProductResultStatus, "noData"> {
  if (direction === "higher-is-better") {
    if (actual >= tiers.good) return "pass";
    if (tiers.warn !== undefined && actual >= tiers.warn) return "warn";
    return "fail";
  }
  if (actual <= tiers.good) return "pass";
  if (tiers.warn !== undefined && actual <= tiers.warn) return "warn";
  return "fail";
}

/**
 * Exit code: 0 = all pass (or only noData), 1 = any warn (no fail), 2 = any fail.
 * @category ProductValidate
 */
export function productValidateExitCode(
  summary: ProductValidateReport["summary"],
): 0 | 1 | 2 {
  if (summary.fail > 0) return 2;
  if (summary.warn > 0) return 1;
  return 0;
}

function metricPassesFilters(
  metric: NormalizedProductMetric,
  opts: ProductValidateOptions,
): boolean {
  if (opts.suite !== undefined) {
    const suite = metric.suite ?? metric.category;
    if (suite !== opts.suite) return false;
  }
  if (opts.route !== undefined && metric.per_route) {
    const observedMatch = findMatchingRouteKey(metric, opts.route);
    const patternMatch = Object.keys(metric.per_route).some((p) =>
      matchRoutePattern(p, opts.route!),
    );
    if (!observedMatch && !patternMatch) return false;
  }
  return true;
}

function resolveDirection(
  metric: NormalizedProductMetric,
  routeKey?: string,
): ProductDirection {
  if (routeKey && metric.per_route?.[routeKey]?.direction) {
    return metric.per_route[routeKey].direction!;
  }
  return metric.direction;
}

function resolveBaseline(
  metric: NormalizedProductMetric,
  routeKey?: string,
): number | undefined {
  if (routeKey && metric.per_route?.[routeKey]?.baseline !== undefined) {
    return metric.per_route[routeKey].baseline;
  }
  return metric.baseline;
}

function resolvePercentile(
  metric: NormalizedProductMetric,
  routeKey?: string,
): string | undefined {
  if (routeKey && metric.per_route?.[routeKey]?.percentile) {
    return metric.per_route[routeKey].percentile;
  }
  return metric.percentile;
}

function indexActuals(
  actuals: ProductActual[],
): Map<string, Map<string | undefined, number>> {
  const map = new Map<string, Map<string | undefined, number>>();
  for (const a of actuals) {
    let byRoute = map.get(a.key);
    if (!byRoute) {
      byRoute = new Map();
      map.set(a.key, byRoute);
    }
    byRoute.set(a.route, a.actual);
  }
  return map;
}

function buildRow(
  key: string,
  metric: NormalizedProductMetric,
  status: ProductResultStatus,
  tiers: ProductTiers,
  opts: {
    route?: string;
    actual?: number;
    routeKey?: string;
  },
): ProductValidateResultRow {
  const row: ProductValidateResultRow = {
    key,
    tiers: {
      good: tiers.good,
      ...(tiers.warn !== undefined ? { warn: tiers.warn } : {}),
    },
    status,
  };
  if (metric.label) row.label = metric.label;
  if (metric.suite) row.suite = metric.suite;
  else if (metric.category) row.suite = metric.category;
  if (opts.route !== undefined) row.route = opts.route;
  if (opts.actual !== undefined) row.actual = opts.actual;
  const pct = resolvePercentile(metric, opts.routeKey);
  if (pct) row.percentile = pct;
  if (opts.actual !== undefined) {
    const baseline = resolveBaseline(metric, opts.routeKey);
    if (baseline !== undefined) {
      row.delta_from_baseline = opts.actual - baseline;
    }
  }
  return row;
}

function findActualForRoute(
  byRoute: Map<string | undefined, number> | undefined,
  routeFilter: string,
  matchedKey?: string,
): number | undefined {
  if (!byRoute) return undefined;
  for (const [obs, val] of byRoute) {
    if (obs === undefined) continue;
    if (obs === routeFilter) return val;
    if (matchedKey && matchRoutePattern(matchedKey, obs)) return val;
    if (matchRoutePattern(routeFilter, obs)) return val;
  }
  return undefined;
}

/**
 * Evaluate a normalized product spec against actuals.
 * @category ProductValidate
 */
export function validateProductActuals(
  spec: NormalizedProductSpec,
  actuals: ProductActual[],
  options: ProductValidateOptions = {},
): ProductValidateReport {
  const indexed = indexActuals(actuals);
  const results: ProductValidateResultRow[] = [];
  const routeFilter = options.route;

  for (const [key, metric] of Object.entries(spec.metrics)) {
    if (!metricPassesFilters(metric, options)) continue;

    const byRoute = indexed.get(key);
    const routeKeys = metric.per_route ? Object.keys(metric.per_route) : [];

    if (routeFilter) {
      const matchedKey =
        findMatchingRouteKey(metric, routeFilter) ??
        (metric.per_route?.[routeFilter] ? routeFilter : undefined);
      const tiers = resolveProductTiers(metric, matchedKey);
      const direction = resolveDirection(metric, matchedKey);
      const actual =
        byRoute?.get(routeFilter) ??
        (matchedKey ? byRoute?.get(matchedKey) : undefined) ??
        findActualForRoute(byRoute, routeFilter, matchedKey);

      if (actual === undefined) {
        const global = byRoute?.get(undefined);
        if (global !== undefined && !metric.per_route) {
          const st = compareProductActual(global, tiers, direction);
          results.push(
            buildRow(key, metric, st, tiers, {
              route: routeFilter,
              actual: global,
              routeKey: matchedKey,
            }),
          );
        } else {
          results.push(
            buildRow(key, metric, "noData", tiers, {
              route: routeFilter,
              routeKey: matchedKey,
            }),
          );
        }
      } else {
        const st = compareProductActual(actual, tiers, direction);
        results.push(
          buildRow(key, metric, st, tiers, {
            route: routeFilter,
            actual,
            routeKey: matchedKey,
          }),
        );
      }
      continue;
    }

    if (routeKeys.length > 0) {
      const seenRoutes = new Set<string>();

      if (byRoute) {
        for (const [obsRoute, actual] of byRoute) {
          if (obsRoute === undefined) continue;
          const matchedKey = findMatchingRouteKey(metric, obsRoute);
          if (!matchedKey) continue;
          if (seenRoutes.has(matchedKey)) continue;
          seenRoutes.add(matchedKey);
          const tiers = resolveProductTiers(metric, matchedKey);
          const direction = resolveDirection(metric, matchedKey);
          const st = compareProductActual(actual, tiers, direction);
          results.push(
            buildRow(key, metric, st, tiers, {
              route: obsRoute,
              actual,
              routeKey: matchedKey,
            }),
          );
        }
      }

      for (const rk of routeKeys) {
        if (seenRoutes.has(rk)) continue;
        const hasObs = byRoute
          ? [...byRoute.keys()].some(
              (r) => r !== undefined && findMatchingRouteKey(metric, r) === rk,
            )
          : false;
        if (hasObs) continue;
        const tiers = resolveProductTiers(metric, rk);
        results.push(
          buildRow(key, metric, "noData", tiers, {
            route: rk,
            routeKey: rk,
          }),
        );
      }

      const global = byRoute?.get(undefined);
      if (global !== undefined) {
        const tiers = resolveProductTiers(metric);
        const direction = resolveDirection(metric);
        const st = compareProductActual(global, tiers, direction);
        results.push(
          buildRow(key, metric, st, tiers, {
            actual: global,
          }),
        );
      }
      continue;
    }

    const tiers = resolveProductTiers(metric);
    const direction = resolveDirection(metric);
    const actual = byRoute?.get(undefined);
    if (actual === undefined) {
      if (byRoute && byRoute.size === 1) {
        const only = [...byRoute.entries()][0]!;
        const st = compareProductActual(only[1], tiers, direction);
        results.push(
          buildRow(key, metric, st, tiers, {
            route: only[0],
            actual: only[1],
          }),
        );
      } else {
        results.push(buildRow(key, metric, "noData", tiers, {}));
      }
    } else {
      const st = compareProductActual(actual, tiers, direction);
      results.push(buildRow(key, metric, st, tiers, { actual }));
    }
  }

  const summary = { pass: 0, warn: 0, fail: 0, noData: 0 };
  for (const r of results) {
    if (r.status === "pass") summary.pass++;
    else if (r.status === "warn") summary.warn++;
    else if (r.status === "fail") summary.fail++;
    else summary.noData++;
  }

  const version = spec.version ? `@${spec.version}` : "";
  return {
    spec: `${spec.name}${version}`,
    evaluatedAt: options.evaluatedAt ?? new Date().toISOString(),
    dataSource: options.dataSource ?? "unknown",
    summary,
    results,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function ensurePerRoute(
  rawMetric: Record<string, unknown>,
  routeKey: string,
): void {
  if (!isRecord(rawMetric.per_route)) {
    rawMetric.per_route = {};
  }
  const pr = rawMetric.per_route as Record<string, unknown>;
  if (!isRecord(pr[routeKey])) {
    pr[routeKey] = {};
  }
}

/**
 * Apply actuals onto a raw product document's baseline fields (deep clone).
 * Writes `metrics[key].baseline` or `metrics[key].per_route[route].baseline`.
 * @category ProductValidate
 */
export function applyProductBaselines(
  rawDoc: Record<string, unknown>,
  spec: NormalizedProductSpec,
  actuals: ProductActual[],
  options: ProductBaselineOptions = {},
): {
  document: Record<string, unknown>;
  updated: Array<{ key: string; route?: string; baseline: number }>;
} {
  const document = structuredClone(rawDoc);
  const metricsKey = isRecord(document.metrics)
    ? "metrics"
    : isRecord(document.targets)
      ? "targets"
      : null;
  if (!metricsKey) {
    throw new Error("document has no metrics/targets map");
  }
  const metricsMap = document[metricsKey] as Record<
    string,
    Record<string, unknown>
  >;
  const updated: Array<{ key: string; route?: string; baseline: number }> = [];
  const indexed = indexActuals(actuals);

  for (const [key, metric] of Object.entries(spec.metrics)) {
    if (options.suite !== undefined) {
      const suite = metric.suite ?? metric.category;
      if (suite !== options.suite) continue;
    }
    const byRoute = indexed.get(key);
    if (!byRoute) continue;

    const rawMetric = metricsMap[key];
    if (!isRecord(rawMetric)) continue;

    if (options.route) {
      const matchedKey =
        findMatchingRouteKey(metric, options.route) ?? options.route;
      const actual =
        byRoute.get(options.route) ??
        findActualForRoute(byRoute, options.route, matchedKey);
      if (actual === undefined) continue;
      ensurePerRoute(rawMetric, matchedKey);
      const pr = rawMetric.per_route as Record<string, Record<string, unknown>>;
      pr[matchedKey] = { ...(pr[matchedKey] ?? {}), baseline: actual };
      updated.push({ key, route: matchedKey, baseline: actual });
      continue;
    }

    for (const [obsRoute, actual] of byRoute) {
      if (obsRoute === undefined) {
        rawMetric.baseline = actual;
        updated.push({ key, baseline: actual });
        continue;
      }
      const matchedKey = findMatchingRouteKey(metric, obsRoute) ?? obsRoute;
      ensurePerRoute(rawMetric, matchedKey);
      const pr = rawMetric.per_route as Record<string, Record<string, unknown>>;
      pr[matchedKey] = { ...(pr[matchedKey] ?? {}), baseline: actual };
      updated.push({ key, route: matchedKey, baseline: actual });
    }
  }

  return { document, updated };
}
