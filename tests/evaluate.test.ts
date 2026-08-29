import { describe, expect, it } from "vitest";
import { compareObjective, evaluateSuite } from "../src/evaluate.js";
import type { MetricSuiteDoc } from "../src/types.js";

const suite: MetricSuiteDoc = {
  apiVersion: "mtargets/v1",
  kind: "MetricSuite",
  metadata: { id: "demo", title: "Demo", version: "1.0.0" },
  spec: {
    policy: { failOn: ["fail", "error"] },
    subjects: [{ id: "web", type: "surface" }],
    indicators: [
      {
        id: "lcp",
        kind: "timing",
        unit: "ms",
        higherIsWorse: true,
        subjectRef: "web",
        source: { type: "lighthouse", query: "largest-contentful-paint" },
        aggregate: "p75",
      },
      {
        id: "spend",
        kind: "gauge",
        unit: "USD",
        higherIsWorse: true,
        scope: "suite",
        source: { type: "usage", query: "cost" },
        aggregate: "sum",
      },
      {
        id: "pass_rate",
        kind: "assertion",
        unit: "1",
        higherIsWorse: false,
        subjectRef: "web",
        source: { type: "eval-suite", query: "smoke" },
        aggregate: "pass_rate",
      },
    ],
    objectives: [
      {
        id: "lcp-good",
        indicator: "lcp",
        op: "lte",
        value: 2500,
        severity: "error",
      },
      {
        id: "spend-soft",
        indicator: "spend",
        op: "lte",
        value: 100,
        severity: "warn",
      },
      {
        id: "eval-bar",
        indicator: "pass_rate",
        op: "gte",
        value: 1,
        severity: "error",
      },
    ],
    composites: [
      {
        id: "gate",
        mode: "score",
        severity: "error",
        objectives: [
          { ref: "lcp-good", weight: 2, key: true },
          { ref: "eval-bar", weight: 2, key: true },
          { ref: "spend-soft", weight: 1 },
        ],
        totalScore: { pass: 0.9, warn: 0.5 },
      },
    ],
  },
};

describe("evaluateSuite", () => {
  it("passes when all objectives met", () => {
    const run = evaluateSuite(suite, [
      { indicatorId: "lcp", observed: 2000 },
      { indicatorId: "spend", observed: 50 },
      { indicatorId: "pass_rate", observed: 1 },
    ]);
    expect(run.spec.status).toBe("pass");
    expect(run.spec.summary?.passed).toBe(3);
    expect(run.metadata.suiteId).toBe("demo");
  });

  it("fails on error-severity breach", () => {
    const run = evaluateSuite(suite, [
      { indicatorId: "lcp", observed: 3000 },
      { indicatorId: "spend", observed: 50 },
      { indicatorId: "pass_rate", observed: 1 },
    ]);
    expect(run.spec.status).toBe("fail");
    const lcp = run.spec.results.find((r) => r.objectiveId === "lcp-good");
    expect(lcp?.status).toBe("fail");
  });

  it("warns on warn-severity breach without failing suite", () => {
    const run = evaluateSuite(suite, [
      { indicatorId: "lcp", observed: 2000 },
      { indicatorId: "spend", observed: 120 },
      { indicatorId: "pass_rate", observed: 1 },
    ]);
    expect(run.spec.status).toBe("warn");
    expect(
      run.spec.results.find((r) => r.objectiveId === "spend-soft")?.status,
    ).toBe("warn");
  });

  it("evaluates target compliance", () => {
    const withTarget: MetricSuiteDoc = {
      ...suite,
      spec: {
        ...suite.spec,
        composites: undefined,
        objectives: [
          {
            id: "slo",
            indicator: "lcp",
            op: "lte",
            value: 2500,
            target: 0.99,
            severity: "error",
          },
        ],
      },
    };
    const pass = evaluateSuite(withTarget, [
      { indicatorId: "lcp", observed: 2000, compliance: 0.995 },
    ]);
    expect(pass.spec.status).toBe("pass");

    const fail = evaluateSuite(withTarget, [
      { indicatorId: "lcp", observed: 2000, compliance: 0.9 },
    ]);
    expect(fail.spec.status).toBe("fail");
  });

  it("fails composite on key objective", () => {
    const run = evaluateSuite(suite, [
      { indicatorId: "lcp", observed: 2000 },
      { indicatorId: "spend", observed: 50 },
      { indicatorId: "pass_rate", observed: 0.5 },
    ]);
    const gate = run.spec.compositeResults?.find((c) => c.compositeId === "gate");
    expect(gate?.status).toBe("fail");
    expect(run.spec.status).toBe("fail");
  });
});

describe("compareObjective", () => {
  it("supports between and in", () => {
    expect(compareObjective("between", 5, { min: 1, max: 10 })).toBe(true);
    expect(compareObjective("in", "a", ["a", "b"])).toBe(true);
    expect(compareObjective("not_in", "c", ["a", "b"])).toBe(true);
  });
});
