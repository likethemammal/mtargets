import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseDocumentText } from "../src/parse.js";
import {
  assertValidProductSpec,
  isProductSpec,
  normalizeProductSpec,
  resolveProductTiers,
  validateProductSpec,
} from "../src/product-schema.js";
import { validateFiles } from "../src/validate-files.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const productDir = path.join(root, "examples", "product");

function loadJson(name: string): unknown {
  return parseDocumentText(
    readFileSync(path.join(productDir, name), "utf8"),
  );
}

describe("product schema v0.2", () => {
  it("detects product specs and rejects MetricSuite docs", () => {
    expect(isProductSpec(loadJson("v0.2-minimal.mtargets.json"))).toBe(true);
    expect(isProductSpec(loadJson("v0.1-legacy.mtargets.json"))).toBe(true);
    expect(
      isProductSpec({
        apiVersion: "mtargets/v1",
        kind: "MetricSuite",
        name: "x",
        metrics: {},
      }),
    ).toBe(false);
  });

  it("validates the v0.2 minimal example", () => {
    const raw = loadJson("v0.2-minimal.mtargets.json");
    const result = validateProductSpec(raw);
    expect(result.ok).toBe(true);
    const { spec } = normalizeProductSpec(raw);
    expect(spec).not.toBeNull();
    expect(spec!.metrics.lcp.tiers.good).toBe(2500);
    expect(spec!.metrics.lcp.tiers.warn).toBe(4000);
    expect(spec!.metrics.lcp.percentile).toBe("p75");
    expect(spec!.metrics.lcp.source).toBe("rum");
    expect(spec!.metrics.lcp.category).toBe("cwv");
    expect(spec!.metrics.lcp.suite).toBe("cwv");
    expect(spec!.metrics.lcp.direction).toBe("lower-is-better");
    expect(spec!.metrics.lcp.baseline).toBe(1800);
    expect(spec!.metrics.lcp.per_route?.["/rating"]?.baseline).toBe(1200);
    expect(spec!.metrics["lighthouse-perf"].direction).toBe("higher-is-better");
  });

  it("normalizes v0.1 target/warning into tiers.good/warn", () => {
    const raw = loadJson("v0.1-legacy.mtargets.json");
    const { spec, issues } = normalizeProductSpec(raw);
    expect(spec).not.toBeNull();
    expect(spec!.metrics["style-tab-mount"].tiers.good).toBe(500);
    expect(spec!.metrics["style-tab-mount"].tiers.warn).toBe(1000);
    expect(spec!.metrics["style-tab-mount"].label).toBe(
      "Time to fully mount the Style Curation tab",
    );
    expect(issues.some((i) => i.path === "targets")).toBe(true);
    expect(
      issues.some(
        (i) =>
          i.path === "targets.style-tab-mount.critical" &&
          i.severity === "warning",
      ),
    ).toBe(true);
  });

  it("falls back tiers.good from legacy target when tiers omitted", () => {
    const result = validateProductSpec({
      name: "fallback",
      metrics: {
        x: { unit: "ms", target: 100, warning: 200 },
      },
    });
    expect(result.ok).toBe(true);
    const spec = assertValidProductSpec({
      name: "fallback",
      metrics: { x: { target: 100 } },
    });
    expect(spec.metrics.x.tiers.good).toBe(100);
    expect(spec.metrics.x.direction).toBe("lower-is-better");
  });

  it("rejects missing tiers.good / target", () => {
    const result = validateProductSpec({
      name: "bad",
      metrics: { x: { unit: "ms" } },
    });
    expect(result.ok).toBe(false);
    expect(
      result.issues.some((i) => i.message.includes("tiers.good")),
    ).toBe(true);
  });

  it("rejects invalid percentile / source / category / direction", () => {
    const result = validateProductSpec({
      name: "enums",
      metrics: {
        x: {
          tiers: { good: 1 },
          percentile: "p99",
          source: "browser",
          category: "latency",
          direction: "sideways",
        },
      },
    });
    expect(result.ok).toBe(false);
    const paths = result.issues.map((i) => i.path);
    expect(paths).toContain("metrics.x.percentile");
    expect(paths).toContain("metrics.x.source");
    expect(paths).toContain("metrics.x.category");
    expect(paths).toContain("metrics.x.direction");
  });

  it("rejects inverted tiers for direction", () => {
    const lower = validateProductSpec({
      name: "dir",
      metrics: {
        x: {
          direction: "lower-is-better",
          tiers: { good: 100, warn: 50 },
        },
      },
    });
    expect(lower.ok).toBe(false);

    const higher = validateProductSpec({
      name: "dir",
      metrics: {
        x: {
          direction: "higher-is-better",
          tiers: { good: 90, warn: 95 },
        },
      },
    });
    expect(higher.ok).toBe(false);
  });

  it("validates per_route overrides and resolveProductTiers", () => {
    const spec = assertValidProductSpec({
      name: "routes",
      metrics: {
        lcp: {
          tiers: { good: 2500, warn: 4000 },
          per_route: {
            "/a": { tiers: { good: 2000, warn: 3000 }, baseline: 1500 },
            "/b": { baseline: 900 },
          },
        },
      },
    });
    expect(resolveProductTiers(spec.metrics.lcp).good).toBe(2500);
    expect(resolveProductTiers(spec.metrics.lcp, "/a").good).toBe(2000);
    expect(resolveProductTiers(spec.metrics.lcp, "/a").warn).toBe(3000);
    expect(resolveProductTiers(spec.metrics.lcp, "/b").good).toBe(2500);
    expect(spec.metrics.lcp.per_route?.["/b"]?.baseline).toBe(900);
  });

  it("warns when suite key is missing from suites map", () => {
    const result = validateProductSpec({
      name: "suites",
      suites: { cwv: "Core Web Vitals" },
      metrics: {
        x: { tiers: { good: 1 }, suite: "missing" },
      },
    });
    expect(result.ok).toBe(true);
    expect(
      result.issues.some(
        (i) => i.path === "metrics.x.suite" && i.severity === "warning",
      ),
    ).toBe(true);
  });

  it("validateFiles accepts product examples", async () => {
    const result = await validateFiles([productDir], { cwd: root });
    expect(result.ok).toBe(true);
    expect(result.results.every((r) => r.kind === "ProductSpec")).toBe(true);
    expect(result.summary.files).toBeGreaterThanOrEqual(2);
  });
});
