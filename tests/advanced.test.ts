import { describe, expect, it } from "vitest";
import { checkDrift, checkQueries, suiteToAlertSnapshot } from "../src/drift.js";
import { evaluateSuite } from "../src/evaluate.js";
import {
  importBudgetJson,
  importK6Thresholds,
  importOpenSlo,
} from "../src/interop.js";
import { resolveRatioObserved } from "../src/ratio.js";
import { resolveSuiteForStage } from "../src/stage.js";
import type { MetricSuiteDoc } from "../src/types.js";
import { validateDocument } from "../src/validate.js";
import { loadSuite } from "../src/load.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const ratioSuite: MetricSuiteDoc = {
  apiVersion: "mtargets/v1",
  kind: "MetricSuite",
  metadata: { id: "ratio-demo", title: "Ratio" },
  spec: {
    subjects: [{ id: "api", type: "service" }],
    indicators: [
      {
        id: "avail",
        kind: "ratio",
        unit: "1",
        subjectRef: "api",
        source: {
          type: "promql",
          good: "good_q",
          total: "total_q",
        },
      },
    ],
    objectives: [
      {
        id: "slo",
        indicator: "avail",
        op: "gte",
        value: 0.99,
        severity: "error",
        errorBudget: {
          budgetingMethod: "Occurrences",
          target: 0.99,
          window: "30d",
          burnRates: [
            { id: "fast", window: "1h", maxBurnRate: 14.4, severity: "error" },
          ],
        },
        distribution: {
          percentiles: [
            { p: 95, op: "lte", value: 300 },
            { p: 99, op: "lte", value: 800 },
          ],
        },
      },
    ],
    alertPolicies: [
      {
        id: "page",
        forObjectives: ["slo"],
        conditions: [{ onStatus: ["fail"], severity: "error" }],
        notify: { method: "page" },
      },
    ],
    stages: [
      {
        id: "staging",
        objectiveOverrides: [{ objectiveId: "slo", value: 0.95 }],
      },
      {
        id: "prod",
        inherits: "staging",
        objectiveOverrides: [{ objectiveId: "slo", value: 0.99 }],
      },
    ],
    waivers: [
      {
        id: "w1",
        objectiveIds: ["slo"],
        reason: "incident",
        approvedBy: "sre",
        expiresAt: "2099-01-01T00:00:00Z",
        statusOverride: "skip",
      },
    ],
    policy: {
      sampling: { minSampleSize: 10, requireDimensions: ["region"] },
      privacy: { allowPii: false, retention: "7d", classification: "internal" },
    },
    evidence: [
      {
        id: "logs",
        type: "logs",
        privacy: { redact: ["email"], retention: "3d", allowPii: false },
      },
    ],
  },
};

describe("advanced features 1-10", () => {
  it("validates the advanced example suite", async () => {
    const { validation } = await loadSuite(
      path.join(root, "examples/suites/advanced-reliability-ux.mtargets.yaml"),
    );
    expect(validation.ok).toBe(true);
  });

  it("validates ratio suite with budgets/alerts/stages/waivers", () => {
    expect(validateDocument(ratioSuite).ok).toBe(true);
  });

  it("resolves ratio from good/total parts", () => {
    const v = resolveRatioObserved(
      { type: "promql", good: "g", total: "t" },
      { indicatorId: "avail", ratio: { good: 99, total: 100 } },
    );
    expect(v).toBeCloseTo(0.99);
  });

  it("evaluates error budget burn rates", () => {
    const run = evaluateSuite(ratioSuite, [
      {
        indicatorId: "avail",
        observed: 0.995,
        samples: { n: 100, dimensions: { region: "us" } },
        errorBudget: {
          remaining: 0.5,
          burnRates: [{ window: "1h", burnRate: 20, alertId: "fast" }],
        },
        distribution: { percentiles: { "95": 200, "99": 400 } },
      },
    ]);
    // burn exceeds → fail, but waiver skips
    const r = run.spec.results.find((x) => x.objectiveId === "slo");
    expect(r?.waiverId).toBe("w1");
    expect(r?.status).toBe("skipped");
  });

  it("enforces sampling dimensions", () => {
    const suite = structuredClone(ratioSuite);
    suite.spec.waivers = [];
    const run = evaluateSuite(suite, [
      {
        indicatorId: "avail",
        observed: 1,
        samples: { n: 100 },
        distribution: { percentiles: { "95": 100, "99": 200 } },
        errorBudget: { remaining: 1, burnRates: [{ window: "1h", burnRate: 1 }] },
      },
    ]);
    expect(run.spec.results[0]?.status).toBe("error");
  });

  it("applies stage overlays", () => {
    const staging = resolveSuiteForStage(ratioSuite, "staging");
    expect(staging.spec.objectives[0]?.value).toBe(0.95);
    const prod = resolveSuiteForStage(ratioSuite, "prod");
    expect(prod.spec.objectives[0]?.value).toBe(0.99);
  });

  it("imports OpenSLO, budget.json, and k6 thresholds", () => {
    const openslo = importOpenSlo({
      apiVersion: "openslo/v1",
      kind: "SLO",
      metadata: { name: "api-avail", displayName: "API Availability" },
      spec: {
        service: "api",
        budgetingMethod: "Occurrences",
        timeWindow: [{ duration: "30d", isRolling: true }],
        indicator: {
          spec: {
            ratioMetric: {
              good: {
                metricSource: {
                  type: "Prometheus",
                  spec: { query: "good" },
                },
              },
              total: {
                metricSource: {
                  type: "Prometheus",
                  spec: { query: "total" },
                },
              },
            },
          },
        },
        objectives: [{ displayName: "Good", target: 0.999 }],
      },
    });
    expect(validateDocument(openslo).ok).toBe(true);

    const budget = importBudgetJson([
      {
        path: "/*",
        timings: [{ metric: "interactive", budget: 3000 }],
        resourceSizes: [{ resourceType: "script", budget: 125 }],
      },
    ]);
    expect(validateDocument(budget).ok).toBe(true);

    const k6 = importK6Thresholds({
      http_req_duration: ["p(95)<500"],
      checks: ["rate>0.99"],
    });
    expect(validateDocument(k6).ok).toBe(true);
  });

  it("checkQueries and checkDrift", () => {
    const q = checkQueries(ratioSuite);
    expect(q.ok).toBe(true);
    const snap = suiteToAlertSnapshot(ratioSuite);
    const drift = checkDrift(ratioSuite, snap);
    expect(drift.ok).toBe(true);
    const drifted = checkDrift(ratioSuite, [
      { id: "slo", op: "lt", value: 1 },
    ]);
    expect(drifted.ok).toBe(false);
  });
});
