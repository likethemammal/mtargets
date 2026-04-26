import {
  AGGREGATE_METHODS,
  DOCUMENT_KINDS,
  DURATION_SHORTHAND,
  ID_PATTERN,
  INDICATOR_KINDS,
  OPS,
  SEVERITIES,
  SUBJECT_TYPES,
  WINDOW_TYPES,
  includesEnum,
  isAggregateMethod,
  normalizeWindow,
} from "./constants.js";
import { API_VERSION, type MtargetsDocument } from "./types.js";

/** @category Validation */
export type ValidationSeverity = "error" | "warning";

/** @category Validation */
export interface ValidationIssue {
  path: string;
  message: string;
  severity: ValidationSeverity;
}

/** @category Validation */
export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

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

function checkId(path: string, id: unknown, issues: ValidationIssue[]): void {
  if (!isString(id) || !id) {
    issues.push(err(path, "id is required and must be a string"));
    return;
  }
  if (!ID_PATTERN.test(id)) {
    issues.push(
      err(path, `id "${id}" must match ${ID_PATTERN}`),
    );
  }
}

function checkMetadata(
  meta: unknown,
  issues: ValidationIssue[],
  requireSuiteId = false,
): void {
  if (!isRecord(meta)) {
    issues.push(err("metadata", "metadata is required"));
    return;
  }
  checkId("metadata.id", meta.id, issues);
  if (!isString(meta.title) || !meta.title) {
    issues.push(err("metadata.title", "title is required"));
  }
  if (requireSuiteId) {
    if (!isString(meta.suiteId) || !meta.suiteId) {
      issues.push(err("metadata.suiteId", "suiteId is required on MetricRun"));
    }
  }
}

function checkWindow(path: string, window: unknown, issues: ValidationIssue[]): void {
  if (window === undefined) return;
  if (isString(window)) {
    if (
      window !== "run" &&
      window !== "ci" &&
      window !== "day" &&
      window !== "week" &&
      window !== "month" &&
      !DURATION_SHORTHAND.test(window)
    ) {
      issues.push(warn(path, `unrecognized window shorthand "${window}"`));
    }
    return;
  }
  if (!isRecord(window)) {
    issues.push(err(path, "window must be a string or object"));
    return;
  }
  if (!includesEnum(WINDOW_TYPES, window.type)) {
    issues.push(err(`${path}.type`, `invalid window type`));
  }
  if (window.type === "rolling" && !isString(window.duration)) {
    issues.push(err(`${path}.duration`, "rolling window requires duration"));
  }
}

function checkSource(path: string, source: unknown, issues: ValidationIssue[]): void {
  if (!isRecord(source)) {
    issues.push(err(path, "source is required"));
    return;
  }
  if (!isString(source.type) || !source.type) {
    issues.push(err(`${path}.type`, "source.type is required"));
  }
  if (source.credentialsRef !== undefined && !isString(source.credentialsRef)) {
    issues.push(err(`${path}.credentialsRef`, "must be a string"));
  }
}

function checkOpValue(
  path: string,
  op: unknown,
  value: unknown,
  issues: ValidationIssue[],
): void {
  if (!includesEnum(OPS, op)) {
    issues.push(err(`${path}.op`, `invalid op`));
    return;
  }
  if (value === undefined) {
    issues.push(err(`${path}.value`, "value is required"));
    return;
  }
  if (op === "between") {
    if (
      !isRecord(value) ||
      typeof value.min !== "number" ||
      typeof value.max !== "number"
    ) {
      issues.push(err(`${path}.value`, "between requires { min, max } numbers"));
    }
  } else if (op === "in" || op === "not_in") {
    if (!Array.isArray(value)) {
      issues.push(err(`${path}.value`, `${op} requires an array value`));
    }
  }
}

function uniqueIds(
  items: unknown,
  path: string,
  issues: ValidationIssue[],
): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(items)) return ids;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!isRecord(item)) continue;
    const id = item.id;
    if (!isString(id)) continue;
    if (ids.has(id)) {
      issues.push(err(`${path}[${i}].id`, `duplicate id "${id}"`));
    }
    ids.add(id);
  }
  return ids;
}

function validateSuite(doc: Record<string, unknown>, issues: ValidationIssue[]): void {
  checkMetadata(doc.metadata, issues);
  if (!isRecord(doc.spec)) {
    issues.push(err("spec", "spec is required"));
    return;
  }
  const spec = doc.spec;

  const subjectIds = uniqueIds(spec.subjects, "spec.subjects", issues);
  const indicatorIds = uniqueIds(spec.indicators, "spec.indicators", issues);
  const objectiveIds = uniqueIds(spec.objectives, "spec.objectives", issues);
  const evidenceIds = uniqueIds(spec.evidence, "spec.evidence", issues);
  uniqueIds(spec.composites, "spec.composites", issues);

  if (!Array.isArray(spec.indicators) || spec.indicators.length < 1) {
    const hasImports =
      Array.isArray(spec.imports) && spec.imports.length > 0;
    if (!hasImports) {
      issues.push(err("spec.indicators", "at least one indicator is required"));
    }
  }
  if (!Array.isArray(spec.objectives) || spec.objectives.length < 1) {
    issues.push(err("spec.objectives", "at least one objective is required"));
  }

  // When indicators are only supplied via imports, skip local indicator ref
  // checks (caller should resolve imports first for full validation).
  const indicatorsLocal = Array.isArray(spec.indicators) ? spec.indicators : [];
  const deferIndicatorRefs =
    indicatorsLocal.length === 0 &&
    Array.isArray(spec.imports) &&
    spec.imports.length > 0;

  if (Array.isArray(spec.subjects)) {
    for (let i = 0; i < spec.subjects.length; i++) {
      const s = spec.subjects[i];
      if (!isRecord(s)) {
        issues.push(err(`spec.subjects[${i}]`, "must be an object"));
        continue;
      }
      checkId(`spec.subjects[${i}].id`, s.id, issues);
      if (!includesEnum(SUBJECT_TYPES, s.type)) {
        issues.push(err(`spec.subjects[${i}].type`, "invalid subject type"));
      }
    }
  }

  if (Array.isArray(spec.indicators)) {
    for (let i = 0; i < spec.indicators.length; i++) {
      const ind = spec.indicators[i];
      const p = `spec.indicators[${i}]`;
      if (!isRecord(ind)) {
        issues.push(err(p, "must be an object"));
        continue;
      }
      checkId(`${p}.id`, ind.id, issues);
      if (!includesEnum(INDICATOR_KINDS, ind.kind)) {
        issues.push(err(`${p}.kind`, "invalid indicator kind"));
      }
      if (!isString(ind.unit) || !ind.unit) {
        issues.push(err(`${p}.unit`, "unit is required"));
      }
      checkSource(`${p}.source`, ind.source, issues);
      checkWindow(`${p}.window`, ind.window, issues);

      if (ind.aggregate !== undefined) {
        if (isString(ind.aggregate)) {
          if (!isAggregateMethod(ind.aggregate)) {
            issues.push(err(`${p}.aggregate`, "invalid aggregate method"));
          }
        } else if (isRecord(ind.aggregate)) {
          if (!includesEnum(AGGREGATE_METHODS, ind.aggregate.method)) {
            issues.push(err(`${p}.aggregate.method`, "invalid aggregate method"));
          }
        } else {
          issues.push(err(`${p}.aggregate`, "must be string or object"));
        }
      }

      if (ind.subjectRef !== undefined) {
        if (!isString(ind.subjectRef)) {
          issues.push(err(`${p}.subjectRef`, "must be a string"));
        } else if (
          subjectIds.size > 0 &&
          !subjectIds.has(ind.subjectRef) &&
          ind.scope !== "suite"
        ) {
          issues.push(
            err(`${p}.subjectRef`, `unknown subject "${ind.subjectRef}"`),
          );
        }
      } else if (
        ind.scope !== "suite" &&
        Array.isArray(spec.subjects) &&
        spec.subjects.length > 1
      ) {
        issues.push(
          err(
            `${p}.subjectRef`,
            "subjectRef required when suite has multiple subjects (unless scope is suite)",
          ),
        );
      }

      if (ind.kind === "ratio" && isRecord(ind.source)) {
        const hasRaw =
          ind.source.rawType !== undefined && ind.source.query !== undefined;
        const hasGoodTotal =
          ind.source.good !== undefined && ind.source.total !== undefined;
        const hasBadTotal =
          ind.source.bad !== undefined && ind.source.total !== undefined;
        if (!hasRaw && !hasGoodTotal && !hasBadTotal) {
          if (ind.source.query !== undefined) {
            issues.push(
              warn(
                `${p}.source`,
                "ratio with only query is allowed; prefer good+total or bad+total",
              ),
            );
          } else {
            issues.push(
              err(
                `${p}.source`,
                "ratio SLI requires good+total, bad+total, or rawType+query",
              ),
            );
          }
        }
      }

      if (ind.missing !== undefined) {
        if (!isRecord(ind.missing)) {
          issues.push(err(`${p}.missing`, "must be an object"));
        } else if (
          ind.missing.behavior === "treat_as" &&
          typeof ind.missing.treatAs !== "number"
        ) {
          issues.push(
            err(`${p}.missing.treatAs`, "treat_as requires numeric treatAs"),
          );
        }
      }

      if (ind.sampling !== undefined) {
        checkSampling(`${p}.sampling`, ind.sampling, issues);
      }
    }
  }

  if (Array.isArray(spec.objectives)) {
    for (let i = 0; i < spec.objectives.length; i++) {
      const obj = spec.objectives[i];
      const p = `spec.objectives[${i}]`;
      if (!isRecord(obj)) {
        issues.push(err(p, "must be an object"));
        continue;
      }
      checkId(`${p}.id`, obj.id, issues);
      if (!isString(obj.indicator)) {
        issues.push(err(`${p}.indicator`, "indicator ref is required"));
      } else if (
        !deferIndicatorRefs &&
        indicatorIds.size > 0 &&
        !indicatorIds.has(obj.indicator)
      ) {
        issues.push(
          err(`${p}.indicator`, `unknown indicator "${obj.indicator}"`),
        );
      }
      if (!includesEnum(SEVERITIES, obj.severity)) {
        issues.push(err(`${p}.severity`, "invalid severity"));
      }
      checkOpValue(p, obj.op, obj.value, issues);

      if (obj.target !== undefined && obj.targetPercent !== undefined) {
        issues.push(
          err(p, "only one of target or targetPercent may be set"),
        );
      }
      if (obj.target !== undefined) {
        if (typeof obj.target !== "number" || obj.target < 0 || obj.target > 1) {
          issues.push(err(`${p}.target`, "target must be a number in [0, 1]"));
        }
      }
      if (obj.targetPercent !== undefined) {
        if (
          typeof obj.targetPercent !== "number" ||
          obj.targetPercent < 0 ||
          obj.targetPercent >= 100
        ) {
          issues.push(
            err(`${p}.targetPercent`, "targetPercent must be in [0, 100)"),
          );
        }
      }

      if (Array.isArray(obj.evidenceRefs)) {
        for (let j = 0; j < obj.evidenceRefs.length; j++) {
          const ref = obj.evidenceRefs[j];
          if (!isString(ref)) {
            issues.push(err(`${p}.evidenceRefs[${j}]`, "must be a string"));
          } else if (evidenceIds.size > 0 && !evidenceIds.has(ref)) {
            issues.push(
              err(`${p}.evidenceRefs[${j}]`, `unknown evidence "${ref}"`),
            );
          }
        }
      }

      if (obj.errorBudget !== undefined) {
        checkErrorBudget(`${p}.errorBudget`, obj.errorBudget, issues);
      }
      if (obj.distribution !== undefined) {
        checkDistribution(`${p}.distribution`, obj.distribution, issues);
      }

      // Direction hint
      if (
        isString(obj.indicator) &&
        Array.isArray(spec.indicators) &&
        (obj.op === "lt" || obj.op === "lte" || obj.op === "gt" || obj.op === "gte")
      ) {
        const ind = spec.indicators.find(
          (x) => isRecord(x) && x.id === obj.indicator,
        );
        if (isRecord(ind) && typeof ind.higherIsWorse === "boolean") {
          const worseHigh = ind.higherIsWorse;
          const upperBound = obj.op === "lt" || obj.op === "lte";
          if (worseHigh && !upperBound) {
            issues.push(
              warn(
                p,
                "higherIsWorse indicator with lower-bound op may be inverted",
              ),
            );
          }
          if (!worseHigh && upperBound && ind.kind === "score") {
            issues.push(
              warn(p, "score indicators usually use gte/gt lower bounds"),
            );
          }
        }
      }
    }
  }

  if (Array.isArray(spec.composites)) {
    for (let i = 0; i < spec.composites.length; i++) {
      const c = spec.composites[i];
      const p = `spec.composites[${i}]`;
      if (!isRecord(c)) {
        issues.push(err(p, "must be an object"));
        continue;
      }
      checkId(`${p}.id`, c.id, issues);
      if (!includesEnum(["score", "all", "any"] as const, c.mode)) {
        issues.push(err(`${p}.mode`, "mode must be score|all|any"));
      }
      if (!includesEnum(SEVERITIES, c.severity)) {
        issues.push(err(`${p}.severity`, "invalid severity"));
      }
      if (!Array.isArray(c.objectives) || c.objectives.length < 1) {
        issues.push(err(`${p}.objectives`, "at least one member required"));
      } else {
        for (let j = 0; j < c.objectives.length; j++) {
          const m = c.objectives[j];
          if (!isRecord(m) || !isString(m.ref)) {
            issues.push(err(`${p}.objectives[${j}].ref`, "ref is required"));
          } else if (objectiveIds.size > 0 && !objectiveIds.has(m.ref)) {
            issues.push(
              err(`${p}.objectives[${j}].ref`, `unknown objective "${m.ref}"`),
            );
          }
        }
      }
    }
  }

  if (Array.isArray(spec.evidence)) {
    for (let i = 0; i < spec.evidence.length; i++) {
      const e = spec.evidence[i];
      const p = `spec.evidence[${i}]`;
      if (!isRecord(e)) {
        issues.push(err(p, "must be an object"));
        continue;
      }
      checkId(`${p}.id`, e.id, issues);
      if (!isString(e.type)) {
        issues.push(err(`${p}.type`, "type is required"));
      }
      if (Array.isArray(e.forObjectives)) {
        for (let j = 0; j < e.forObjectives.length; j++) {
          const ref = e.forObjectives[j];
          if (!isString(ref)) continue;
          if (objectiveIds.size > 0 && !objectiveIds.has(ref)) {
            issues.push(
              err(`${p}.forObjectives[${j}]`, `unknown objective "${ref}"`),
            );
          }
        }
      }
      if (e.privacy !== undefined) {
        checkPrivacy(`${p}.privacy`, e.privacy, issues);
      }
    }
  }

  if (spec.defaults !== undefined) {
    if (!isRecord(spec.defaults)) {
      issues.push(err("spec.defaults", "must be an object"));
    } else {
      checkWindow("spec.defaults.window", spec.defaults.window, issues);
      if (spec.defaults.sampling !== undefined) {
        checkSampling("spec.defaults.sampling", spec.defaults.sampling, issues);
      }
    }
  }

  if (spec.policy !== undefined) {
    if (!isRecord(spec.policy)) {
      issues.push(err("spec.policy", "must be an object"));
    } else {
      if (spec.policy.sampling !== undefined) {
        checkSampling("spec.policy.sampling", spec.policy.sampling, issues);
      }
      if (spec.policy.privacy !== undefined) {
        checkPrivacy("spec.policy.privacy", spec.policy.privacy, issues);
      }
    }
  }

  const alertPolicyIds = uniqueIds(
    spec.alertPolicies,
    "spec.alertPolicies",
    issues,
  );
  if (Array.isArray(spec.alertPolicies)) {
    for (let i = 0; i < spec.alertPolicies.length; i++) {
      const a = spec.alertPolicies[i];
      const p = `spec.alertPolicies[${i}]`;
      if (!isRecord(a)) {
        issues.push(err(p, "must be an object"));
        continue;
      }
      checkId(`${p}.id`, a.id, issues);
      if (!Array.isArray(a.conditions) || a.conditions.length < 1) {
        issues.push(err(`${p}.conditions`, "at least one condition required"));
      }
      if (Array.isArray(a.forObjectives)) {
        for (let j = 0; j < a.forObjectives.length; j++) {
          const ref = a.forObjectives[j];
          if (!isString(ref)) continue;
          if (objectiveIds.size > 0 && !objectiveIds.has(ref)) {
            issues.push(
              err(`${p}.forObjectives[${j}]`, `unknown objective "${ref}"`),
            );
          }
        }
      }
    }
  }
  void alertPolicyIds;

  if (Array.isArray(spec.stages)) {
    const stageIds = uniqueIds(spec.stages, "spec.stages", issues);
    for (let i = 0; i < spec.stages.length; i++) {
      const s = spec.stages[i];
      const p = `spec.stages[${i}]`;
      if (!isRecord(s)) {
        issues.push(err(p, "must be an object"));
        continue;
      }
      checkId(`${p}.id`, s.id, issues);
      if (s.inherits !== undefined) {
        if (!isString(s.inherits)) {
          issues.push(err(`${p}.inherits`, "must be a string"));
        } else if (!stageIds.has(s.inherits)) {
          issues.push(err(`${p}.inherits`, `unknown stage "${s.inherits}"`));
        }
      }
      if (Array.isArray(s.objectiveOverrides)) {
        for (let j = 0; j < s.objectiveOverrides.length; j++) {
          const o = s.objectiveOverrides[j];
          if (!isRecord(o) || !isString(o.objectiveId)) {
            issues.push(
              err(`${p}.objectiveOverrides[${j}].objectiveId`, "required"),
            );
          } else if (
            objectiveIds.size > 0 &&
            !objectiveIds.has(o.objectiveId)
          ) {
            issues.push(
              err(
                `${p}.objectiveOverrides[${j}].objectiveId`,
                `unknown objective "${o.objectiveId}"`,
              ),
            );
          }
        }
      }
    }
  }

  if (Array.isArray(spec.waivers)) {
    uniqueIds(spec.waivers, "spec.waivers", issues);
    for (let i = 0; i < spec.waivers.length; i++) {
      const w = spec.waivers[i];
      const p = `spec.waivers[${i}]`;
      if (!isRecord(w)) {
        issues.push(err(p, "must be an object"));
        continue;
      }
      checkId(`${p}.id`, w.id, issues);
      if (!isString(w.reason) || !w.reason) {
        issues.push(err(`${p}.reason`, "reason is required"));
      }
      if (!isString(w.approvedBy) || !w.approvedBy) {
        issues.push(err(`${p}.approvedBy`, "approvedBy is required"));
      }
      if (!isString(w.expiresAt) || Number.isNaN(Date.parse(w.expiresAt))) {
        issues.push(err(`${p}.expiresAt`, "expiresAt must be ISO-8601"));
      }
      if (!Array.isArray(w.objectiveIds) || w.objectiveIds.length < 1) {
        issues.push(err(`${p}.objectiveIds`, "at least one objectiveId"));
      } else {
        for (let j = 0; j < w.objectiveIds.length; j++) {
          const ref = w.objectiveIds[j];
          if (!isString(ref)) continue;
          if (objectiveIds.size > 0 && !objectiveIds.has(ref)) {
            issues.push(
              err(`${p}.objectiveIds[${j}]`, `unknown objective "${ref}"`),
            );
          }
        }
      }
      if (
        w.statusOverride !== undefined &&
        !includesEnum(["skip", "warn", "pass"] as const, w.statusOverride)
      ) {
        issues.push(
          err(`${p}.statusOverride`, "must be skip|warn|pass"),
        );
      }
    }
  }

  // Normalize windows for rolling duration check already done
  void normalizeWindow;
}

function checkSampling(
  path: string,
  sampling: unknown,
  issues: ValidationIssue[],
): void {
  if (!isRecord(sampling)) {
    issues.push(err(path, "must be an object"));
    return;
  }
  if (
    sampling.minSampleSize !== undefined &&
    (typeof sampling.minSampleSize !== "number" || sampling.minSampleSize < 1)
  ) {
    issues.push(err(`${path}.minSampleSize`, "must be a number >= 1"));
  }
  if (
    sampling.confidence !== undefined &&
    (typeof sampling.confidence !== "number" ||
      sampling.confidence < 0 ||
      sampling.confidence > 1)
  ) {
    issues.push(err(`${path}.confidence`, "must be in [0, 1]"));
  }
  if (
    sampling.coldStart !== undefined &&
    !includesEnum(["include", "exclude", "separate"] as const, sampling.coldStart)
  ) {
    issues.push(err(`${path}.coldStart`, "must be include|exclude|separate"));
  }
}

function checkPrivacy(
  path: string,
  privacy: unknown,
  issues: ValidationIssue[],
): void {
  if (!isRecord(privacy)) {
    issues.push(err(path, "must be an object"));
    return;
  }
  if (
    privacy.classification !== undefined &&
    !includesEnum(
      ["public", "internal", "confidential", "restricted"] as const,
      privacy.classification,
    )
  ) {
    issues.push(err(`${path}.classification`, "invalid classification"));
  }
  if (privacy.retention !== undefined && !isString(privacy.retention)) {
    issues.push(err(`${path}.retention`, "must be a string (e.g. 7d)"));
  }
}

function checkErrorBudget(
  path: string,
  budget: unknown,
  issues: ValidationIssue[],
): void {
  if (!isRecord(budget)) {
    issues.push(err(path, "must be an object"));
    return;
  }
  const methods = [
    "Occurrences",
    "Timeslices",
    "occurrences",
    "timeslices",
  ] as const;
  if (!includesEnum(methods, budget.budgetingMethod)) {
    issues.push(
      err(`${path}.budgetingMethod`, "must be Occurrences|Timeslices"),
    );
  }
  if (
    typeof budget.target !== "number" ||
    budget.target <= 0 ||
    budget.target > 1
  ) {
    issues.push(err(`${path}.target`, "must be in (0, 1]"));
  }
  checkWindow(`${path}.window`, budget.window, issues);
  if (budget.window === undefined) {
    issues.push(err(`${path}.window`, "window is required"));
  }
  if (Array.isArray(budget.burnRates)) {
    for (let i = 0; i < budget.burnRates.length; i++) {
      const br = budget.burnRates[i];
      const bp = `${path}.burnRates[${i}]`;
      if (!isRecord(br)) {
        issues.push(err(bp, "must be an object"));
        continue;
      }
      checkWindow(`${bp}.window`, br.window, issues);
      if (typeof br.maxBurnRate !== "number" || br.maxBurnRate <= 0) {
        issues.push(err(`${bp}.maxBurnRate`, "must be a number > 0"));
      }
      if (!includesEnum(SEVERITIES, br.severity)) {
        issues.push(err(`${bp}.severity`, "invalid severity"));
      }
    }
  }
}

function checkDistribution(
  path: string,
  dist: unknown,
  issues: ValidationIssue[],
): void {
  if (!isRecord(dist)) {
    issues.push(err(path, "must be an object"));
    return;
  }
  const hasP = Array.isArray(dist.percentiles) && dist.percentiles.length > 0;
  const hasB = Array.isArray(dist.buckets) && dist.buckets.length > 0;
  if (!hasP && !hasB) {
    issues.push(
      err(path, "distribution requires percentiles and/or buckets"),
    );
  }
  if (Array.isArray(dist.percentiles)) {
    for (let i = 0; i < dist.percentiles.length; i++) {
      const g = dist.percentiles[i];
      const gp = `${path}.percentiles[${i}]`;
      if (!isRecord(g)) {
        issues.push(err(gp, "must be an object"));
        continue;
      }
      if (typeof g.p !== "number" || g.p < 0 || g.p > 100) {
        issues.push(err(`${gp}.p`, "percentile must be in [0, 100]"));
      }
      checkOpValue(gp, g.op, g.value, issues);
    }
  }
}

function validateRun(doc: Record<string, unknown>, issues: ValidationIssue[]): void {
  checkMetadata(doc.metadata, issues, true);
  if (!isRecord(doc.spec)) {
    issues.push(err("spec", "spec is required"));
    return;
  }
  const spec = doc.spec;
  if (!isString(spec.startedAt)) {
    issues.push(err("spec.startedAt", "startedAt is required (ISO-8601)"));
  }
  if (
    !includesEnum(
      ["pass", "warn", "fail", "skipped", "error"] as const,
      spec.status,
    )
  ) {
    issues.push(err("spec.status", "invalid run status"));
  }
  if (!Array.isArray(spec.results)) {
    issues.push(err("spec.results", "results array is required"));
  } else {
    for (let i = 0; i < spec.results.length; i++) {
      const r = spec.results[i];
      const p = `spec.results[${i}]`;
      if (!isRecord(r)) {
        issues.push(err(p, "must be an object"));
        continue;
      }
      if (!isString(r.objectiveId)) {
        issues.push(err(`${p}.objectiveId`, "required"));
      }
      if (!isString(r.indicatorId)) {
        issues.push(err(`${p}.indicatorId`, "required"));
      }
      if (
        !includesEnum(
          ["pass", "warn", "fail", "skipped", "error"] as const,
          r.status,
        )
      ) {
        issues.push(err(`${p}.status`, "invalid status"));
      }
    }
  }
}

function validateCatalog(
  doc: Record<string, unknown>,
  issues: ValidationIssue[],
): void {
  checkMetadata(doc.metadata, issues);
  if (!isRecord(doc.spec)) {
    issues.push(err("spec", "spec is required"));
    return;
  }
  uniqueIds(doc.spec.subjects, "spec.subjects", issues);
  uniqueIds(doc.spec.indicators, "spec.indicators", issues);
  uniqueIds(doc.spec.sources, "spec.sources", issues);
  uniqueIds(doc.spec.evidence, "spec.evidence", issues);

  if (Array.isArray(doc.spec.indicators)) {
    for (let i = 0; i < doc.spec.indicators.length; i++) {
      const ind = doc.spec.indicators[i];
      if (!isRecord(ind)) continue;
      checkId(`spec.indicators[${i}].id`, ind.id, issues);
      if (!includesEnum(INDICATOR_KINDS, ind.kind)) {
        issues.push(err(`spec.indicators[${i}].kind`, "invalid kind"));
      }
      checkSource(`spec.indicators[${i}].source`, ind.source, issues);
    }
  }
}

function validateBinding(
  doc: Record<string, unknown>,
  issues: ValidationIssue[],
): void {
  checkMetadata(doc.metadata, issues);
  if (!isRecord(doc.spec)) {
    issues.push(err("spec", "spec is required"));
    return;
  }
  if (!isString(doc.spec.suiteId) || !doc.spec.suiteId) {
    issues.push(err("spec.suiteId", "suiteId is required"));
  }
}

/**
 * Validate an mtargets document (already parsed object).
 * Returns `ok: false` if any error-severity issues exist.
 *
 * Prefer {@link validateFiles} for paths/directories from CI.
 *
 * @param input - Parsed YAML/JSON object
 * @category Validation
 */
export function validateDocument(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [err("$", "document must be an object")],
    };
  }

  if (input.apiVersion !== API_VERSION) {
    issues.push(
      err(
        "apiVersion",
        `apiVersion must be "${API_VERSION}" (got ${String(input.apiVersion)})`,
      ),
    );
  }

  if (!includesEnum(DOCUMENT_KINDS, input.kind)) {
    issues.push(err("kind", `kind must be one of ${DOCUMENT_KINDS.join(", ")}`));
    return { ok: false, issues };
  }

  switch (input.kind) {
    case "MetricSuite":
      validateSuite(input, issues);
      break;
    case "MetricRun":
      validateRun(input, issues);
      break;
    case "MetricCatalog":
      validateCatalog(input, issues);
      break;
    case "MetricBinding":
      validateBinding(input, issues);
      break;
  }

  return {
    ok: !issues.some((i) => i.severity === "error"),
    issues,
  };
}

/**
 * Validate and narrow to {@link MtargetsDocument}; throws on error issues.
 * @category Validation
 */
export function assertValidDocument(input: unknown): MtargetsDocument {
  const result = validateDocument(input);
  if (!result.ok) {
    const msg = result.issues
      .filter((i) => i.severity === "error")
      .map((i) => `${i.path}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid mtargets document:\n${msg}`);
  }
  return input as MtargetsDocument;
}

/** Format validation issues for CLI / logs. @category Validation */
export function formatValidationIssues(issues: ValidationIssue[]): string {
  if (issues.length === 0) return "No issues";
  return issues
    .map((i) => `${i.severity.toUpperCase()} ${i.path}: ${i.message}`)
    .join("\n");
}
