/**
 * Drift + query-shape checks (item 9).
 * Structural / declared-vs-expected — does not call live backends.
 */
import type { MetricSuiteDoc, Objective } from "./types.js";

/** @category Drift */
export interface DeclaredAlertSnapshot {
  /** Objective or alert id in the live system. */
  id: string;
  op?: string;
  value?: number | string;
  severity?: string;
  source?: string;
}

/** @category Drift */
export interface DriftIssue {
  path: string;
  message: string;
  severity: "error" | "warning";
}

/** @category Drift */
export interface DriftResult {
  ok: boolean;
  issues: DriftIssue[];
}

/**
 * Compare suite objectives to a snapshot of live alerts / gates.
 * Flags objectives missing in live config and threshold mismatches.
 * @category Drift
 */
export function checkDrift(
  suite: MetricSuiteDoc,
  live: DeclaredAlertSnapshot[],
): DriftResult {
  const issues: DriftIssue[] = [];
  const liveById = new Map(live.map((a) => [a.id, a]));

  for (const obj of suite.spec.objectives) {
    const match =
      liveById.get(obj.id) ??
      liveById.get(`${suite.metadata.id}.${obj.id}`);
    if (!match) {
      issues.push({
        path: `objectives.${obj.id}`,
        message: "no matching live alert/gate in snapshot (drift)",
        severity: "warning",
      });
      continue;
    }
    if (match.op && match.op !== obj.op) {
      issues.push({
        path: `objectives.${obj.id}.op`,
        message: `live op "${match.op}" != suite op "${obj.op}"`,
        severity: "error",
      });
    }
    if (
      match.value !== undefined &&
      String(match.value) !== String(obj.value)
    ) {
      issues.push({
        path: `objectives.${obj.id}.value`,
        message: `live value ${String(match.value)} != suite value ${String(obj.value)}`,
        severity: "error",
      });
    }
  }

  for (const alert of live) {
    const inSuite = suite.spec.objectives.some(
      (o) =>
        o.id === alert.id || `${suite.metadata.id}.${o.id}` === alert.id,
    );
    if (!inSuite) {
      issues.push({
        path: `live.${alert.id}`,
        message: "live alert/gate has no suite objective (orphan)",
        severity: "warning",
      });
    }
  }

  return {
    ok: !issues.some((i) => i.severity === "error"),
    issues,
  };
}

/** @category Drift */
export interface QueryCheckIssue {
  path: string;
  message: string;
  severity: "error" | "warning";
}

/** @category Drift */
export interface QueryCheckResult {
  ok: boolean;
  issues: QueryCheckIssue[];
}

/**
 * Dry-run query/shape validation without calling backends.
 * Ensures ratio SLIs are well-formed and sources have resolvable queries.
 * @category Drift
 */
export function checkQueries(suite: MetricSuiteDoc): QueryCheckResult {
  const issues: QueryCheckIssue[] = [];

  for (const ind of suite.spec.indicators) {
    const p = `indicators.${ind.id}.source`;
    const s = ind.source;
    if (!s.type) {
      issues.push({ path: p, message: "missing source.type", severity: "error" });
    }
    if (ind.kind === "ratio") {
      const hasRaw = s.rawType !== undefined && s.query !== undefined;
      const hasGoodTotal = s.good !== undefined && s.total !== undefined;
      const hasBadTotal = s.bad !== undefined && s.total !== undefined;
      if (!hasRaw && !hasGoodTotal && !hasBadTotal && s.query === undefined) {
        issues.push({
          path: p,
          message:
            "ratio SLI needs good+total, bad+total, rawType+query, or query",
          severity: "error",
        });
      }
    } else if (
      s.query === undefined &&
      s.good === undefined &&
      s.params === undefined
    ) {
      issues.push({
        path: p,
        message: "source has no query/params (may be unresolvable)",
        severity: "warning",
      });
    }
  }

  for (const obj of suite.spec.objectives) {
    if (obj.errorBudget) {
      if (
        typeof obj.errorBudget.target !== "number" ||
        obj.errorBudget.target <= 0 ||
        obj.errorBudget.target > 1
      ) {
        issues.push({
          path: `objectives.${obj.id}.errorBudget.target`,
          message: "error budget target must be in (0, 1]",
          severity: "error",
        });
      }
      for (const br of obj.errorBudget.burnRates ?? []) {
        if (!(br.maxBurnRate > 0)) {
          issues.push({
            path: `objectives.${obj.id}.errorBudget.burnRates`,
            message: "maxBurnRate must be > 0",
            severity: "error",
          });
        }
      }
    }
    if (obj.distribution?.percentiles) {
      for (const g of obj.distribution.percentiles) {
        if (g.p < 0 || g.p > 100) {
          issues.push({
            path: `objectives.${obj.id}.distribution.percentiles`,
            message: `percentile p=${g.p} out of range`,
            severity: "error",
          });
        }
      }
    }
  }

  return {
    ok: !issues.some((i) => i.severity === "error"),
    issues,
  };
}

/** Summarize objectives for drift snapshots. @category Drift */
export function suiteToAlertSnapshot(
  suite: MetricSuiteDoc,
): DeclaredAlertSnapshot[] {
  return suite.spec.objectives.map((o: Objective) => ({
    id: o.id,
    op: o.op,
    value: typeof o.value === "object" ? JSON.stringify(o.value) : o.value,
    severity: o.severity,
    source: suite.spec.indicators.find((i) => i.id === o.indicator)?.source
      .type,
  }));
}
