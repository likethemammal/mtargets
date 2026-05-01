import { resolveRatioObserved } from "./ratio.js";
import { resolveSuiteForStage } from "./stage.js";
import type {
  AlertFire,
  AlertPolicy,
  CompositeObjective,
  CompositeResult,
  EvaluateOptions,
  EvaluationPolicy,
  IndicatorObservation,
  MetricRunDoc,
  MetricSuiteDoc,
  Objective,
  ObjectiveResult,
  ObjectiveValue,
  Op,
  ResultStatus,
  SuiteRunStatus,
  Waiver,
} from "./types.js";
import { API_VERSION } from "./types.js";

function toNumber(v: number | string | boolean | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function compare(op: Op, observed: unknown, value: ObjectiveValue): boolean {
  if (op === "in") {
    if (!Array.isArray(value)) return false;
    return value.some((x) => x === observed);
  }
  if (op === "not_in") {
    if (!Array.isArray(value)) return false;
    return !value.some((x) => x === observed);
  }
  if (op === "between") {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      typeof (value as { min?: unknown }).min !== "number" ||
      typeof (value as { max?: unknown }).max !== "number"
    ) {
      return false;
    }
    const n = toNumber(observed as number | string | boolean | null);
    if (n === null) return false;
    const { min, max } = value as { min: number; max: number };
    return n >= min && n <= max;
  }

  if (op === "eq")
    return observed === value || toNumber(observed as never) === toNumber(value as never);
  if (op === "neq")
    return !(
      observed === value || toNumber(observed as never) === toNumber(value as never)
    );

  const left = toNumber(observed as number | string | boolean | null);
  const right = toNumber(value as number | string);
  if (left === null || right === null) {
    if (typeof observed === "string" && typeof value === "string") {
      if (op === "lt") return observed < value;
      if (op === "lte") return observed <= value;
      if (op === "gt") return observed > value;
      if (op === "gte") return observed >= value;
    }
    return false;
  }

  switch (op) {
    case "lt":
      return left < right;
    case "lte":
      return left <= right;
    case "gt":
      return left > right;
    case "gte":
      return left >= right;
    default:
      return false;
  }
}

function parseRelativeDelta(value: number | string, baseline: number): number | null {
  if (typeof value === "number") return value;
  const m = /^([+-])?(\d+(?:\.\d+)?)%$/.exec(value.trim());
  if (m) {
    const sign = m[1] === "-" ? -1 : 1;
    const pct = Number(m[2]) / 100;
    return baseline * sign * pct;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function evaluateRelative(
  objective: Objective,
  observed: number | string | boolean | null | undefined,
  baseline: number | string | null | undefined,
): boolean | null {
  if (!objective.relative) return null;
  if (baseline === null || baseline === undefined) return null;

  const baseNum = toNumber(baseline);
  const obsNum = toNumber(observed);
  if (baseNum === null || obsNum === null) {
    return compare(
      objective.relative.op,
      observed,
      objective.relative.value as ObjectiveValue,
    );
  }

  const delta = parseRelativeDelta(objective.relative.value, baseNum);
  if (delta === null) return null;

  if (
    typeof objective.relative.value === "string" &&
    objective.relative.value.includes("%")
  ) {
    const upper = baseNum + Math.abs(delta);
    const lower = baseNum - Math.abs(delta);
    const op = objective.relative.op;
    if (op === "lte" || op === "lt") return compare(op, obsNum, upper);
    if (op === "gte" || op === "gt") return compare(op, obsNum, lower);
    if (op === "between") return obsNum >= lower && obsNum <= upper;
  }

  return compare(objective.relative.op, obsNum - baseNum, delta);
}

function targetThreshold(objective: Objective): number | undefined {
  if (objective.target !== undefined) return objective.target;
  if (objective.targetPercent !== undefined) return objective.targetPercent / 100;
  return undefined;
}

function statusFromBreach(met: boolean, severity: Objective["severity"]): ResultStatus {
  if (met) return "pass";
  if (severity === "info") return "pass";
  if (severity === "warn") return "warn";
  return "fail";
}

function worseStatus(a: ResultStatus, b: ResultStatus): ResultStatus {
  const rank: Record<ResultStatus, number> = {
    pass: 0,
    skipped: 1,
    warn: 2,
    fail: 3,
    error: 4,
  };
  return rank[a] >= rank[b] ? a : b;
}

function findObservation(
  observations: IndicatorObservation[],
  indicatorId: string,
): IndicatorObservation | undefined {
  return observations.find((o) => o.indicatorId === indicatorId);
}

function activeWaiver(
  waivers: Waiver[] | undefined,
  objectiveId: string,
  now: Date,
): Waiver | undefined {
  if (!waivers) return undefined;
  return waivers.find((w) => {
    if (!w.objectiveIds.includes(objectiveId)) return false;
    const exp = Date.parse(w.expiresAt);
    return Number.isFinite(exp) && exp > now.getTime();
  });
}

function applyWaiver(
  result: ObjectiveResult,
  waiver: Waiver | undefined,
): ObjectiveResult {
  if (!waiver) return result;
  if (result.status === "pass" || result.status === "skipped") return result;
  const override = waiver.statusOverride ?? "skip";
  return {
    ...result,
    status: override === "pass" ? "pass" : override === "warn" ? "warn" : "skipped",
    waiverId: waiver.id,
    message: [result.message, `waiver ${waiver.id}: ${waiver.reason}`]
      .filter(Boolean)
      .join("; "),
  };
}

function checkSampling(
  suite: MetricSuiteDoc,
  objective: Objective,
  obs: IndicatorObservation | undefined,
): ObjectiveResult | null {
  const indicator = suite.spec.indicators.find((i) => i.id === objective.indicator);
  const sampling =
    indicator?.sampling ??
    suite.spec.policy?.sampling ??
    suite.spec.defaults?.sampling;
  // Legacy policy.minSampleSize remains a runner hint only; enforce via sampling.*.
  if (!sampling) return null;

  const minN = sampling.minSampleSize;
  if (minN !== undefined) {
    const n = obs?.samples?.n;
    if (typeof n !== "number" || n < minN) {
      const behavior = sampling.onInsufficient ?? "fail";
      const status =
        behavior === "skip" ? "skipped" : behavior === "warn" ? "warn" : "fail";
      return {
        objectiveId: objective.id,
        indicatorId: objective.indicator,
        status,
        observed: obs?.observed ?? null,
        unit: obs?.unit ?? indicator?.unit,
        threshold: { op: objective.op, value: objective.value },
        message: `insufficient samples (n=${n ?? 0}, min=${minN})`,
        samples: obs?.samples,
      };
    }
  }

  const required = sampling.requireDimensions ?? [];
  if (required.length) {
    const dims = obs?.samples?.dimensions ?? {};
    const missing = required.filter((d) => !dims[d]);
    if (missing.length) {
      return {
        objectiveId: objective.id,
        indicatorId: objective.indicator,
        status: "error",
        observed: obs?.observed ?? null,
        unit: obs?.unit ?? indicator?.unit,
        threshold: { op: objective.op, value: objective.value },
        message: `missing required sample dimensions: ${missing.join(", ")}`,
        samples: obs?.samples,
      };
    }
  }
  return null;
}

function evaluateDistribution(
  objective: Objective,
  obs: IndicatorObservation | undefined,
): { met: boolean; message?: string } | null {
  const dist = objective.distribution;
  if (!dist) return null;
  const observed = obs?.distribution;
  if (!observed) {
    return { met: false, message: "distribution observation missing" };
  }

  for (const g of dist.percentiles ?? []) {
    const key = String(g.p);
    const val = observed.percentiles?.[key] ?? observed.percentiles?.[`${g.p}`];
    if (val === undefined) {
      return { met: false, message: `missing percentile p${g.p}` };
    }
    if (!compare(g.op, val, g.value)) {
      return {
        met: false,
        message: `p${g.p}=${val} failed ${g.op} ${g.value}`,
      };
    }
  }

  for (const b of dist.buckets ?? []) {
    const key = String(b.le);
    const val = observed.buckets?.[key];
    if (val === undefined) {
      return { met: false, message: `missing bucket le=${b.le}` };
    }
    if (!compare(b.op, val, b.value)) {
      return {
        met: false,
        message: `bucket le=${b.le} value=${val} failed ${b.op} ${b.value}`,
      };
    }
  }

  return { met: true };
}

function evaluateErrorBudget(
  objective: Objective,
  obs: IndicatorObservation | undefined,
): { status: ResultStatus; message?: string } | null {
  const budget = objective.errorBudget;
  if (!budget) return null;
  const eb = obs?.errorBudget;
  if (!eb) {
    // Fall back: compliance vs budget.target when runner only sent compliance
    if (obs?.compliance !== undefined) {
      const met = obs.compliance >= budget.target;
      return {
        status: statusFromBreach(met, objective.severity),
        message: met
          ? undefined
          : `compliance ${obs.compliance} below error-budget target ${budget.target}`,
      };
    }
    return {
      status: "error",
      message: "errorBudget declared but no errorBudget/compliance observation",
    };
  }

  let status: ResultStatus = "pass";
  const messages: string[] = [];

  if (typeof eb.remaining === "number" && eb.remaining < 0) {
    status = worseStatus(status, statusFromBreach(false, objective.severity));
    messages.push(`error budget exhausted (remaining=${eb.remaining})`);
  }

  for (const alert of budget.burnRates ?? []) {
    const windowKey =
      typeof alert.window === "string" ? alert.window : JSON.stringify(alert.window);
    const observedBurn =
      eb.burnRates?.find(
        (b) =>
          b.window === windowKey ||
          b.alertId === alert.id ||
          b.window === String(alert.window),
      )?.burnRate ?? eb.burnRate;
    if (observedBurn === undefined) {
      status = worseStatus(status, "error");
      messages.push(`missing burn rate for window ${windowKey}`);
      continue;
    }
    if (observedBurn > alert.maxBurnRate) {
      status = worseStatus(status, statusFromBreach(false, alert.severity));
      messages.push(
        `burn rate ${observedBurn} > max ${alert.maxBurnRate} (${windowKey})`,
      );
    }
  }

  return { status, message: messages.length ? messages.join("; ") : undefined };
}

function evaluateObjective(
  suite: MetricSuiteDoc,
  objective: Objective,
  observations: IndicatorObservation[],
  now: Date,
): ObjectiveResult {
  const indicator = suite.spec.indicators.find((i) => i.id === objective.indicator);
  const indicatorId = objective.indicator;
  const obs = findObservation(observations, indicatorId);
  const missing = indicator?.missing ?? suite.spec.defaults?.missing;
  const waiver = activeWaiver(suite.spec.waivers, objective.id, now);

  const samplingFail = checkSampling(suite, objective, obs);
  if (samplingFail) return applyWaiver(samplingFail, waiver);

  let observed = obs?.observed;
  if (
    (observed === null || observed === undefined) &&
    indicator?.kind === "ratio" &&
    indicator.source
  ) {
    const ratioVal = resolveRatioObserved(indicator.source, obs);
    if (ratioVal !== null) observed = ratioVal;
  }

  if (observed === null || observed === undefined) {
    // Distribution-only or error-budget-only objectives may omit scalar observed
    if (!objective.distribution && !objective.errorBudget) {
      const behavior = missing?.behavior ?? "fail";
      if (behavior === "skip") {
        return applyWaiver(
          {
            objectiveId: objective.id,
            indicatorId,
            status: "skipped",
            observed: null,
            unit: obs?.unit ?? indicator?.unit,
            threshold: { op: objective.op, value: objective.value },
            message: "missing observation (skip)",
          },
          waiver,
        );
      }
      if (behavior === "treat_as" && typeof missing?.treatAs === "number") {
        observed = missing.treatAs;
      } else if (behavior === "warn") {
        return applyWaiver(
          {
            objectiveId: objective.id,
            indicatorId,
            status: "warn",
            observed: null,
            unit: obs?.unit ?? indicator?.unit,
            threshold: { op: objective.op, value: objective.value },
            message: "missing observation (warn)",
            evidence: obs?.evidence,
          },
          waiver,
        );
      } else {
        return applyWaiver(
          {
            objectiveId: objective.id,
            indicatorId,
            status: "fail",
            observed: null,
            unit: obs?.unit ?? indicator?.unit,
            threshold: { op: objective.op, value: objective.value },
            message: "missing observation",
            evidence: obs?.evidence,
          },
          waiver,
        );
      }
    }
  }

  let status: ResultStatus = "pass";
  const messages: string[] = [];

  if (observed !== null && observed !== undefined) {
    const absoluteMet = compare(objective.op, observed, objective.value);
    const target = targetThreshold(objective);
    let compliance = obs?.compliance;
    let targetMet = true;
    if (target !== undefined) {
      if (compliance === undefined || compliance === null) {
        compliance = absoluteMet ? 1 : 0;
      }
      targetMet = compliance >= target;
    }

    let relativeMet: boolean | null = null;
    if (objective.relative) {
      relativeMet = evaluateRelative(objective, observed, obs?.baseline);
      if (relativeMet === null) {
        return applyWaiver(
          {
            objectiveId: objective.id,
            indicatorId,
            status: "error",
            observed,
            unit: obs?.unit ?? indicator?.unit,
            threshold: { op: objective.op, value: objective.value },
            compliance,
            message: "relative gate could not be evaluated (missing baseline)",
            evidence: obs?.evidence,
            samples: obs?.samples,
          },
          waiver,
        );
      }
    }

    let met = absoluteMet && targetMet;
    if (relativeMet !== null) {
      const combine = objective.relative?.combine ?? "and";
      met = combine === "or" ? met || relativeMet : met && relativeMet;
    }
    status = worseStatus(status, statusFromBreach(met, objective.severity));
    if (!met) messages.push(obs?.message ?? "threshold not met");
  }

  const dist = evaluateDistribution(objective, obs);
  if (dist) {
    if (!dist.met) {
      status = worseStatus(status, statusFromBreach(false, objective.severity));
      if (dist.message) messages.push(dist.message);
    }
  }

  const budget = evaluateErrorBudget(objective, obs);
  if (budget) {
    status = worseStatus(status, budget.status);
    if (budget.message) messages.push(budget.message);
  }

  const result: ObjectiveResult = {
    objectiveId: objective.id,
    indicatorId,
    status,
    observed: observed ?? obs?.observed ?? null,
    unit: obs?.unit ?? indicator?.unit,
    threshold: { op: objective.op, value: objective.value },
    compliance: obs?.compliance,
    message: messages.length ? messages.join("; ") : obs?.message,
    evidence: obs?.evidence,
    samples: obs?.samples,
    errorBudget: obs?.errorBudget,
    distribution: obs?.distribution,
  };

  return applyWaiver(result, waiver);
}

function parseScoreThreshold(v: number | string | undefined): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "number") return v <= 1 ? v : v / 100;
  const s = v.trim();
  if (s.endsWith("%")) return Number(s.slice(0, -1)) / 100;
  const n = Number(s);
  return Number.isFinite(n) ? (n <= 1 ? n : n / 100) : undefined;
}

function isPassingStatus(status: ResultStatus, warnCountsAsPass: boolean): boolean {
  if (status === "pass") return true;
  if (status === "warn") return warnCountsAsPass;
  return false;
}

function evaluateComposite(
  composite: CompositeObjective,
  results: ObjectiveResult[],
): CompositeResult {
  const members = composite.objectives.map((m) => {
    const r = results.find((x) => x.objectiveId === m.ref);
    return { member: m, result: r };
  });

  for (const { member, result } of members) {
    if (!result) {
      return {
        compositeId: composite.id,
        status: "error",
        message: `missing result for objective ${member.ref}`,
      };
    }
    if (member.key && !isPassingStatus(result.status, false)) {
      return {
        compositeId: composite.id,
        status: statusFromBreach(false, composite.severity),
        message: `key objective ${member.ref} did not pass`,
      };
    }
  }

  if (composite.mode === "all") {
    const met = members.every(({ result }) => isPassingStatus(result!.status, false));
    return {
      compositeId: composite.id,
      status: statusFromBreach(met, composite.severity),
    };
  }

  if (composite.mode === "any") {
    const met = members.some(({ result }) => isPassingStatus(result!.status, false));
    return {
      compositeId: composite.id,
      status: statusFromBreach(met, composite.severity),
    };
  }

  let weightSum = 0;
  let earned = 0;
  for (const { member, result } of members) {
    const w = member.weight ?? 1;
    weightSum += w;
    if (isPassingStatus(result!.status, false)) earned += w;
  }
  const score = weightSum === 0 ? 0 : earned / weightSum;
  const passAt = parseScoreThreshold(composite.totalScore?.pass) ?? 1;
  const warnAt = parseScoreThreshold(composite.totalScore?.warn);

  if (score >= passAt) {
    return { compositeId: composite.id, status: "pass", score };
  }
  if (warnAt !== undefined && score >= warnAt) {
    return {
      compositeId: composite.id,
      status:
        composite.severity === "error"
          ? "warn"
          : statusFromBreach(false, composite.severity),
      score,
      message: `score ${score.toFixed(3)} below pass ${passAt}`,
    };
  }
  return {
    compositeId: composite.id,
    status: statusFromBreach(false, composite.severity),
    score,
    message: `score ${score.toFixed(3)} below pass ${passAt}`,
  };
}

function deriveSuiteStatus(
  results: ObjectiveResult[],
  compositeResults: CompositeResult[],
  policy: EvaluationPolicy | undefined,
): SuiteRunStatus {
  const failOn = new Set(policy?.failOn ?? ["fail", "error"]);
  if (policy?.warnIsFailure) failOn.add("warn");

  const all = [
    ...results.map((r) => r.status),
    ...compositeResults.map((r) => r.status),
  ];

  if (all.some((s) => s === "error") && failOn.has("error")) return "error";
  if (all.some((s) => s === "fail") && failOn.has("fail")) return "fail";
  if (all.some((s) => s === "warn")) {
    if (failOn.has("warn")) return "fail";
    return "warn";
  }
  if (all.length > 0 && all.every((s) => s === "skipped")) return "skipped";
  return "pass";
}

function summarize(results: ObjectiveResult[]) {
  const summary = {
    passed: 0,
    warned: 0,
    failed: 0,
    errored: 0,
    skipped: 0,
  };
  for (const r of results) {
    switch (r.status) {
      case "pass":
        summary.passed++;
        break;
      case "warn":
        summary.warned++;
        break;
      case "fail":
        summary.failed++;
        break;
      case "error":
        summary.errored++;
        break;
      case "skipped":
        summary.skipped++;
        break;
    }
  }
  return summary;
}

function collectAlerts(
  suite: MetricSuiteDoc,
  results: ObjectiveResult[],
): AlertFire[] {
  const policies = suite.spec.alertPolicies ?? [];
  if (policies.length === 0) return [];
  const fires: AlertFire[] = [];

  for (const policy of policies) {
    const objs =
      policy.forObjectives && policy.forObjectives.length > 0
        ? results.filter((r) => policy.forObjectives!.includes(r.objectiveId))
        : results;

    for (const cond of policy.conditions) {
      for (const r of objs) {
        let fire = false;
        let message = "";

        if (cond.onStatus?.includes(r.status)) {
          fire = true;
          message = `status ${r.status}`;
        }
        if (
          typeof cond.budgetRemainingBelow === "number" &&
          typeof r.errorBudget?.remaining === "number" &&
          r.errorBudget.remaining < cond.budgetRemainingBelow
        ) {
          fire = true;
          message = `budget remaining ${r.errorBudget.remaining} < ${cond.budgetRemainingBelow}`;
        }
        if (cond.onBurnRateId && r.message?.includes(cond.onBurnRateId)) {
          fire = true;
          message = `burn rate alert ${cond.onBurnRateId}`;
        }

        if (fire) {
          fires.push({
            alertPolicyId: policy.id,
            objectiveId: r.objectiveId,
            severity: cond.severity,
            message: `${policy.title ?? policy.id}: ${message}`,
          });
        }
      }
    }
  }
  return fires;
}

/**
 * Evaluate a MetricSuite against runner observations and produce a MetricRun.
 *
 * Applies stage overlays, sampling/waiver rules, composites, and alert policies.
 *
 * @param suite - Validated MetricSuite (imports should already be resolved if used)
 * @param observations - Measured values keyed by `indicatorId`
 * @param options - Stage, run metadata, clocks
 * @returns A `MetricRun` document (`apiVersion: mtargets/v1`)
 * @category Evaluation
 *
 * @example
 * ```ts
 * const run = evaluateSuite(suite, [{ indicatorId: "lcp", observed: 2100 }]);
 * console.log(run.spec.status); // pass | warn | fail | error | skipped
 * ```
 */
export function evaluateSuite(
  suite: MetricSuiteDoc,
  observations: IndicatorObservation[],
  options: EvaluateOptions = {},
): MetricRunDoc {
  const resolved =
    options.stage !== undefined
      ? resolveSuiteForStage(suite, options.stage)
      : suite;
  const now =
    options.now === undefined
      ? new Date()
      : typeof options.now === "string"
        ? new Date(options.now)
        : options.now;

  const results: ObjectiveResult[] = [];

  for (const objective of resolved.spec.objectives) {
    const result = evaluateObjective(resolved, objective, observations, now);
    results.push(result);
    if (
      resolved.spec.policy?.abortOnFail &&
      (result.status === "fail" || result.status === "error")
    ) {
      break;
    }
  }

  const compositeResults: CompositeResult[] = [];
  for (const composite of resolved.spec.composites ?? []) {
    compositeResults.push(evaluateComposite(composite, results));
  }

  const alertsFired = collectAlerts(resolved, results);
  for (const r of results) {
    const related = alertsFired
      .filter((a) => a.objectiveId === r.objectiveId)
      .map((a) => a.alertPolicyId);
    if (related.length) r.alertsFired = related;
  }

  const status = deriveSuiteStatus(
    results,
    compositeResults,
    resolved.spec.policy,
  );
  const startedAt = options.startedAt ?? new Date().toISOString();
  const finishedAt = options.finishedAt ?? new Date().toISOString();
  const autoId = `run_${resolved.metadata.id}_${startedAt}`
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return {
    apiVersion: API_VERSION,
    kind: "MetricRun",
    metadata: {
      id: options.runId ?? autoId,
      title: options.runTitle ?? `${resolved.metadata.title} run`,
      labels: options.labels,
      suiteId: resolved.metadata.id,
      suiteVersion: resolved.metadata.version,
    },
    spec: {
      startedAt,
      finishedAt,
      status,
      stageId: options.stage,
      subjectSnapshots: options.subjectSnapshots,
      results,
      compositeResults: compositeResults.length ? compositeResults : undefined,
      alertsFired: alertsFired.length ? alertsFired : undefined,
      summary: summarize(results),
    },
  };
}

/**
 * Compare a single observed value against an objective `op` / `value` pair.
 * Exported for tests and custom tooling.
 *
 * @category Evaluation
 */
export function compareObjective(
  op: Op,
  observed: unknown,
  value: ObjectiveValue,
): boolean {
  return compare(op, observed, value);
}

export type { AlertPolicy };
