/**
 * mtargets v1 — TypeScript types.
 * Canonical machine-readable companion to `docs/reference/spec.md`.
 */

/**
 * Current document `apiVersion` string.
 * @category Documents
 */
export const API_VERSION = "mtargets/v1" as const;
/** @category Documents */
export type ApiVersion = typeof API_VERSION;

/** @category Documents */
export type DocumentKind =
  | "MetricSuite"
  | "MetricRun"
  | "MetricCatalog"
  | "MetricBinding";

/** @category Enums */
export type Severity = "info" | "warn" | "error";

/** @category Enums */
export type Op =
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "eq"
  | "neq"
  | "in"
  | "not_in"
  | "between";

/** @category Enums */
export type IndicatorKind =
  | "timing"
  | "ratio"
  | "gauge"
  | "count"
  | "score"
  | "assertion"
  | "histogram";

/** @category Enums */
export type SubjectType =
  | "surface"
  | "service"
  | "flow"
  | "agent"
  | "system"
  | "component"
  | "provider"
  | "hook"
  | "unit"
  | "dataset";

/** @category Enums */
export type AggregateMethod =
  | "p50"
  | "p75"
  | "p90"
  | "p95"
  | "p99"
  | "avg"
  | "min"
  | "max"
  | "sum"
  | "last"
  | "rate"
  | "pass_rate"
  | "pass_count"
  | "fail_count";

/** @category Enums */
export type WindowType = "rolling" | "calendar" | "run" | "ci" | "custom";

/** @category Enums */
export type CalendarPeriod = "day" | "week" | "month" | "quarter";

/** @category Evaluation */
export type ResultStatus = "pass" | "warn" | "fail" | "skipped" | "error";

/** @category Evaluation */
export type SuiteRunStatus = ResultStatus;

/** @category Enums */
export type EvidenceType =
  | "har"
  | "trace"
  | "logs"
  | "screenshot"
  | "profile"
  | "report"
  | "export"
  | "artifact";

/** @category Enums */
export type CaptureMode = "on_fail" | "always" | "on_warn" | "never";

/** @category Enums */
export type MissingBehavior = "fail" | "warn" | "skip" | "treat_as";

/** @category Enums */
export type CompositeMode = "score" | "all" | "any";

/**
 * OpenSLO-compatible budgeting methods.
 * @category Enums
 */
export type BudgetingMethod = "Occurrences" | "Timeslices" | "occurrences" | "timeslices";

/** @category Enums */
export type PrivacyClassification = "public" | "internal" | "confidential" | "restricted";

/** @category Enums */
export type ColdStartPolicy = "include" | "exclude" | "separate";

/** @category Enums */
export type WaiverOverride = "skip" | "warn" | "pass";

/** @category Documents */
export interface Metadata {
  id: string;
  title: string;
  description?: string;
  labels?: Record<string, string>;
  tags?: string[];
  owners?: string[];
  /** Semver of this document's content. */
  version?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** @category Model */
export interface Window {
  type: WindowType;
  /** Duration shorthand, e.g. `5m`, `28d`. Required for rolling. */
  duration?: string;
  calendar?: CalendarPeriod;
  timezone?: string;
  anchor?: string;
}

/**
 * Shorthand duration string or structured window.
 * @category Model
 */
export type WindowInput = Window | string;

/** @category Model */
export interface Aggregate {
  method: AggregateMethod;
  /** Custom percentile 0–100 when method is not a fixed pXX. */
  percentile?: number;
}

/** @category Model */
export type AggregateInput = Aggregate | AggregateMethod;

/** @category Model */
export interface Source {
  /** Open registry string, e.g. `lighthouse`, `promql`, `usage`. */
  type: string;
  query?: string | Record<string, unknown>;
  params?: Record<string, unknown>;
  /** Ratio SLI: good events query (OpenSLO-compatible). */
  good?: string | Record<string, unknown>;
  /** Ratio SLI: bad events query. */
  bad?: string | Record<string, unknown>;
  /** Ratio SLI: total events query. */
  total?: string | Record<string, unknown>;
  /** When using a precomputed ratio metric. */
  rawType?: "success" | "failure";
  /** Opaque credentials reference — never inline secrets. */
  credentialsRef?: string;
}

/** @category Model */
export interface Subject {
  id: string;
  type: SubjectType;
  title?: string;
  description?: string;
  labels?: Record<string, string>;
  /** Open map interpreted by runners. */
  selectors?: Record<string, unknown>;
}

/** @category Model */
export interface MissingPolicy {
  behavior: MissingBehavior;
  treatAs?: number;
}

/**
 * Statistical honesty constraints for an indicator or suite policy.
 * @category Model
 */
export interface SamplingPolicy {
  minSampleSize?: number;
  /** What to do when n < minSampleSize (default fail). */
  onInsufficient?: "fail" | "warn" | "skip";
  coldStart?: ColdStartPolicy;
  /** Dimension keys runners should populate on samples (e.g. device, network). */
  dimensions?: string[];
  /** Dimension keys that must be present or evaluation errors. */
  requireDimensions?: string[];
  /** Optional confidence level hint 0–1 for runners. */
  confidence?: number;
}

/** @category Model */
export interface Indicator {
  id: string;
  title?: string;
  description?: string;
  kind: IndicatorKind;
  unit: string;
  higherIsWorse?: boolean;
  subjectRef?: string;
  scope?: "subject" | "suite";
  source: Source;
  aggregate?: AggregateInput;
  window?: WindowInput;
  labels?: Record<string, string>;
  missing?: MissingPolicy;
  sampling?: SamplingPolicy;
}

/** @category Model */
export type ObjectiveValue =
  | number
  | string
  | Array<number | string>
  | { min: number; max: number };

/** @category Model */
export interface RelativeGate {
  baseline: "previous_pass" | "previous_run" | string;
  op: Op;
  value: number | string;
  combine?: "and" | "or";
}

/**
 * Multi-window burn-rate alert on an error budget (Google SRE style).
 * @category Model
 */
export interface BurnRateAlert {
  id?: string;
  window: WindowInput;
  /** Max allowed burn rate of the error budget (e.g. 14.4). */
  maxBurnRate: number;
  severity: Severity;
}

/**
 * First-class error budget (OpenSLO-inspired).
 * Runners supply remaining/burn observations; evaluate compares burn alerts.
 * @category Model
 */
export interface ErrorBudget {
  budgetingMethod: BudgetingMethod;
  /** SLO target as good fraction, e.g. 0.999 → 0.1% error budget. */
  target: number;
  window: WindowInput;
  burnRates?: BurnRateAlert[];
}

/**
 * Distribution / multi-percentile objective (histogram-friendly).
 * @category Model
 */
export interface DistributionGate {
  /** All listed percentile gates must pass (AND). */
  percentiles?: Array<{
    p: number;
    op: Op;
    value: number;
  }>;
  /** Optional histogram bucket rate gates (le = upper bound). */
  buckets?: Array<{
    le: number;
    op: Op;
    value: number;
  }>;
}

/** @category Model */
export interface Objective {
  id: string;
  title?: string;
  description?: string;
  indicator: string;
  op: Op;
  value: ObjectiveValue;
  severity: Severity;
  labels?: Record<string, string>;
  /** Fraction of window/samples that must meet the condition, [0, 1]. */
  target?: number;
  /** Alternate to target; [0, 100). */
  targetPercent?: number;
  relative?: RelativeGate;
  when?: Record<string, unknown>;
  evidenceRefs?: string[];
  /** First-class error budget for this objective. */
  errorBudget?: ErrorBudget;
  /** Multi-percentile / bucket gates (in addition to primary op/value). */
  distribution?: DistributionGate;
  /** Alert policies that apply to this objective (by id). */
  alertPolicyRefs?: string[];
}

/** @category Model */
export interface CompositeMember {
  ref: string;
  weight?: number;
  /** If true, failure of this objective fails the composite. */
  key?: boolean;
}

/** @category Model */
export interface CompositeObjective {
  id: string;
  title?: string;
  mode: CompositeMode;
  objectives: CompositeMember[];
  totalScore?: {
    pass: number | string;
    warn?: number | string;
  };
  severity: Severity;
}

/** @category Model */
export interface EvidencePrivacy {
  /** Field paths or glob-ish patterns runners should redact. */
  redact?: string[];
  /** Retention shorthand, e.g. `7d`, `30d`. */
  retention?: string;
  allowPii?: boolean;
  classification?: PrivacyClassification;
}

/** @category Model */
export interface EvidenceRequirement {
  id: string;
  type: EvidenceType;
  description?: string;
  required?: boolean;
  filter?: string | Record<string, unknown>;
  capture?: CaptureMode;
  forObjectives?: string[];
  source?: Source;
  privacy?: EvidencePrivacy;
}

/** @category Model */
export interface NotifyTarget {
  /** Channel ids or URLs — prefer refs over secrets. */
  channels?: string[];
  channelsRef?: string;
  /** page | ticket | slack | email | webhook | custom */
  method?: string;
}

/** @category Model */
export interface AlertCondition {
  /** Fire when objective/suite status is one of these. */
  onStatus?: ResultStatus[];
  /** Fire when a named burn-rate alert id breaches. */
  onBurnRateId?: string;
  /** Fire when error budget remaining drops below this fraction. */
  budgetRemainingBelow?: number;
  severity: Severity;
}

/**
 * When to notify (distinct from CI pass/fail).
 * @category Model
 */
export interface AlertPolicy {
  id: string;
  title?: string;
  description?: string;
  /** Empty / omitted → all objectives. */
  forObjectives?: string[];
  conditions: AlertCondition[];
  notify?: NotifyTarget;
}

/** @category Model */
export interface ObjectiveOverride {
  objectiveId: string;
  op?: Op;
  value?: ObjectiveValue;
  severity?: Severity;
  target?: number;
  targetPercent?: number;
  errorBudget?: ErrorBudget;
  distribution?: DistributionGate;
  disabled?: boolean;
}

/**
 * Stage / environment overlay for promotion gates (Keptn-style).
 * @category Model
 */
export interface StageOverlay {
  id: string;
  title?: string;
  description?: string;
  defaults?: SuiteDefaults;
  policy?: EvaluationPolicy;
  objectiveOverrides?: ObjectiveOverride[];
  /** Inherit from another stage id before applying local overrides. */
  inherits?: string;
}

/**
 * Time-bounded exception (change management).
 * Active waivers soften or skip objective failures until expiry.
 * @category Model
 */
export interface Waiver {
  id: string;
  objectiveIds: string[];
  reason: string;
  approvedBy: string;
  /** ISO-8601 expiry; required. */
  expiresAt: string;
  /** How to treat a would-be fail while active (default skip). */
  statusOverride?: WaiverOverride;
  ticketRef?: string;
}

/** @category Model */
export interface EvaluationPolicy {
  failOn?: Array<"fail" | "error" | "warn">;
  warnIsFailure?: boolean;
  abortOnFail?: boolean;
  minSampleSize?: number;
  flakyRetries?: number;
  timezone?: string;
  sampling?: SamplingPolicy;
  /** Default evidence privacy for the suite. */
  privacy?: EvidencePrivacy;
}

/** @category Model */
export interface SuiteDefaults {
  window?: WindowInput;
  severity?: Severity;
  missing?: MissingPolicy;
  currency?: string;
  labels?: Record<string, string>;
  sampling?: SamplingPolicy;
}

/** @category Documents */
export interface CatalogImport {
  catalog: string;
  indicators?: string[];
  subjects?: string[];
}

/** @category Documents */
export interface MetricSuiteSpec {
  intent?: string;
  imports?: CatalogImport[];
  subjects?: Subject[];
  /** Local indicators; may be empty when supplied entirely via imports. */
  indicators: Indicator[];
  objectives: Objective[];
  composites?: CompositeObjective[];
  evidence?: EvidenceRequirement[];
  defaults?: SuiteDefaults;
  policy?: EvaluationPolicy;
  bindings?: Record<string, unknown>;
  /** Alert / notification policies (ops path, not CI). */
  alertPolicies?: AlertPolicy[];
  /** Environment / promotion overlays. */
  stages?: StageOverlay[];
  /** Approved temporary exceptions. */
  waivers?: Waiver[];
}

/** @category Documents */
export interface MetricSuiteDoc {
  apiVersion: ApiVersion;
  kind: "MetricSuite";
  metadata: Metadata;
  spec: MetricSuiteSpec;
}

/** @category Model */
export interface EvidenceAttachment {
  evidenceId: string;
  uri: string;
  contentType?: string;
  /** Runner attestation that privacy policy was applied. */
  privacyApplied?: boolean;
}

/** @category Evaluation */
export interface ErrorBudgetObservation {
  /** Remaining error budget fraction [0, 1+]. */
  remaining?: number;
  /** Consumed fraction of the budget. */
  consumed?: number;
  /** Single burn rate for the objective window. */
  burnRate?: number;
  /** Per-window burn rates matching declared burnRates[].window. */
  burnRates?: Array<{ window: string; burnRate: number; alertId?: string }>;
}

/** @category Evaluation */
export interface DistributionObservation {
  /** Map of percentile → observed value, e.g. { "95": 320, "99": 900 }. */
  percentiles?: Record<string, number>;
  /** Map of le → observed rate/count. */
  buckets?: Record<string, number>;
}

/** @category Evaluation */
export interface ObjectiveResult {
  objectiveId: string;
  indicatorId: string;
  status: ResultStatus;
  observed?: number | string | boolean | null;
  unit?: string;
  threshold?: { op: Op; value: ObjectiveValue };
  compliance?: number;
  message?: string;
  evidence?: EvidenceAttachment[];
  samples?: { n: number; [key: string]: unknown };
  errorBudget?: ErrorBudgetObservation;
  distribution?: DistributionObservation;
  /** Set when a waiver softened this result. */
  waiverId?: string;
  /** Fired alert policy ids (informational on the run). */
  alertsFired?: string[];
}

/** @category Evaluation */
export interface CompositeResult {
  compositeId: string;
  status: ResultStatus;
  score?: number;
  message?: string;
}

/** @category Evaluation */
export interface SubjectSnapshot {
  subjectId: string;
  selectors?: Record<string, unknown>;
}

/** @category Evaluation */
export interface AlertFire {
  alertPolicyId: string;
  objectiveId?: string;
  severity: Severity;
  message: string;
}

/** @category Documents */
export interface MetricRunSpec {
  startedAt: string;
  finishedAt?: string;
  status: SuiteRunStatus;
  /** Stage id used for this evaluation, if any. */
  stageId?: string;
  subjectSnapshots?: SubjectSnapshot[];
  results: ObjectiveResult[];
  compositeResults?: CompositeResult[];
  alertsFired?: AlertFire[];
  summary?: {
    passed: number;
    warned: number;
    failed: number;
    errored: number;
    skipped: number;
  };
}

/** @category Documents */
export interface MetricRunDoc {
  apiVersion: ApiVersion;
  kind: "MetricRun";
  metadata: Metadata & {
    suiteId: string;
    suiteVersion?: string;
  };
  spec: MetricRunSpec;
}

/** @category Documents */
export interface NamedSourceTemplate {
  id: string;
  type: string;
  query?: string | Record<string, unknown>;
  params?: Record<string, unknown>;
  good?: string | Record<string, unknown>;
  bad?: string | Record<string, unknown>;
  total?: string | Record<string, unknown>;
  rawType?: "success" | "failure";
  credentialsRef?: string;
}

/** @category Documents */
export interface MetricCatalogSpec {
  subjects?: Subject[];
  indicators?: Indicator[];
  sources?: NamedSourceTemplate[];
  evidence?: EvidenceRequirement[];
  alertPolicies?: AlertPolicy[];
}

/** @category Documents */
export interface MetricCatalogDoc {
  apiVersion: ApiVersion;
  kind: "MetricCatalog";
  metadata: Metadata;
  spec: MetricCatalogSpec;
}

/** @category Documents */
export interface MetricBindingSpec {
  suiteId: string;
  ui?: Record<string, unknown>;
  api?: Record<string, unknown>;
  tests?: Array<Record<string, unknown>>;
  /** Map stage id → environment-specific binding details. */
  stages?: Record<string, Record<string, unknown>>;
}

/** @category Documents */
export interface MetricBindingDoc {
  apiVersion: ApiVersion;
  kind: "MetricBinding";
  metadata: Metadata;
  spec: MetricBindingSpec;
}

/** @category Documents */
export type MtargetsDocument =
  | MetricSuiteDoc
  | MetricRunDoc
  | MetricCatalogDoc
  | MetricBindingDoc;

/**
 * Observation supplied by a runner for one indicator.
 * @category Evaluation
 */
export interface IndicatorObservation {
  indicatorId: string;
  /** Measured value; null/undefined means missing. */
  observed?: number | string | boolean | null;
  unit?: string;
  /** Compliance ratio when objective.target is used; 0–1. */
  compliance?: number;
  samples?: { n: number; dimensions?: Record<string, string>; [key: string]: unknown };
  message?: string;
  evidence?: EvidenceAttachment[];
  /** Baseline value for relative gates. */
  baseline?: number | string | null;
  /** Ratio parts when indicator is a ratio SLI. */
  ratio?: { good?: number; bad?: number; total?: number };
  errorBudget?: ErrorBudgetObservation;
  distribution?: DistributionObservation;
}

/** @category Evaluation */
export interface EvaluateOptions {
  startedAt?: string;
  finishedAt?: string;
  runId?: string;
  runTitle?: string;
  labels?: Record<string, string>;
  subjectSnapshots?: SubjectSnapshot[];
  /** Apply stage overlay before evaluation. */
  stage?: string;
  /** Clock for waiver expiry (default Date.now). */
  now?: Date | string;
}
