/**
 * Generate Lighthouse CI `lighthouserc` assertions from a product spec.
 *
 * Pulls CWV + synthetic/Lighthouse metrics so LHCI budgets stay derived
 * from the mtargets source of truth.
 * @category ProductGenerate
 */

import type {
  NormalizedProductMetric,
  NormalizedProductSpec,
} from "./product-types.js";

/** LHCI assertion level. @category ProductGenerate */
export type LhciAssertionLevel = "off" | "warn" | "error";

/**
 * eslint-style LHCI assertion: level or [level, options].
 * @category ProductGenerate
 */
export type LhciAssertion =
  | LhciAssertionLevel
  | [LhciAssertionLevel, Record<string, number | string>];

/** Serializable LHCI config fragment. @category ProductGenerate */
export interface LighthousercConfig {
  ci: {
    assert: {
      assertions: Record<string, LhciAssertion>;
    };
  };
}

/** Options for assertion generation. @category ProductGenerate */
export interface GenerateLighthousercOptions {
  /** Assertion level for thresholds (default `error`). */
  level?: LhciAssertionLevel;
}

const METRIC_TO_LHCI: Record<string, string> = {
  lcp: "largest-contentful-paint",
  "largest-contentful-paint": "largest-contentful-paint",
  cls: "cumulative-layout-shift",
  "cumulative-layout-shift": "cumulative-layout-shift",
  fcp: "first-contentful-paint",
  "first-contentful-paint": "first-contentful-paint",
  tbt: "total-blocking-time",
  "total-blocking-time": "total-blocking-time",
  ttfb: "server-response-time",
  "server-response-time": "server-response-time",
  si: "speed-index",
  "speed-index": "speed-index",
  tti: "interactive",
  interactive: "interactive",
  inp: "interaction-to-next-paint",
  "interaction-to-next-paint": "interaction-to-next-paint",
  "lighthouse-perf": "categories:performance",
  "lighthouse-performance": "categories:performance",
  performance: "categories:performance",
  "lighthouse-a11y": "categories:accessibility",
  "lighthouse-accessibility": "categories:accessibility",
  accessibility: "categories:accessibility",
  "lighthouse-bp": "categories:best-practices",
  "lighthouse-best-practices": "categories:best-practices",
  "best-practices": "categories:best-practices",
  "lighthouse-seo": "categories:seo",
  seo: "categories:seo",
};

function isLighthouseRelevant(
  key: string,
  metric: NormalizedProductMetric,
): boolean {
  if (METRIC_TO_LHCI[key]) return true;
  if (metric.category === "cwv") return true;
  if (metric.source === "synthetic") return true;
  if (metric.collect?.toLowerCase().includes("lighthouse")) return true;
  if (key.toLowerCase().includes("lighthouse")) return true;
  return false;
}

function resolveLhciKey(
  key: string,
  metric: NormalizedProductMetric,
): string | undefined {
  if (METRIC_TO_LHCI[key]) return METRIC_TO_LHCI[key];

  if (
    metric.direction === "higher-is-better" &&
    (metric.unit === "score" || metric.unit === "1")
  ) {
    if (/a11y|access/i.test(key)) return "categories:accessibility";
    if (/best.?pract/i.test(key)) return "categories:best-practices";
    if (/seo/i.test(key)) return "categories:seo";
    if (/perf/i.test(key)) return "categories:performance";
  }

  if (metric.category === "cwv") return key;
  return undefined;
}

/**
 * Normalize a product score tier (0–100 or 0–1) to LHCI `minScore` (0–1).
 * @category ProductGenerate
 */
export function toLhciMinScore(good: number): number {
  if (good > 1) return good / 100;
  return good;
}

function buildAssertion(
  metric: NormalizedProductMetric,
  lhciKey: string,
  level: LhciAssertionLevel,
): LhciAssertion {
  const good = metric.tiers.good;
  if (lhciKey.startsWith("categories:")) {
    return [level, { minScore: toLhciMinScore(good) }];
  }
  if (
    metric.direction === "higher-is-better" &&
    (metric.unit === "score" || metric.unit === "1")
  ) {
    return [level, { minScore: toLhciMinScore(good) }];
  }
  return [level, { maxNumericValue: good }];
}

/**
 * Build LHCI assertions object from a normalized product spec.
 * @category ProductGenerate
 */
export function generateLighthousercAssertions(
  spec: NormalizedProductSpec,
  options: GenerateLighthousercOptions = {},
): Record<string, LhciAssertion> {
  const level = options.level ?? "error";
  const assertions: Record<string, LhciAssertion> = {};

  for (const [key, metric] of Object.entries(spec.metrics)) {
    if (!isLighthouseRelevant(key, metric)) continue;
    const lhciKey = resolveLhciKey(key, metric);
    if (!lhciKey) continue;
    if (assertions[lhciKey] !== undefined) continue;
    assertions[lhciKey] = buildAssertion(metric, lhciKey, level);
  }

  return assertions;
}

/**
 * Build a full `lighthouserc` config object (`ci.assert.assertions`).
 * @category ProductGenerate
 */
export function generateLighthousercConfig(
  spec: NormalizedProductSpec,
  options: GenerateLighthousercOptions = {},
): LighthousercConfig {
  return {
    ci: {
      assert: {
        assertions: generateLighthousercAssertions(spec, options),
      },
    },
  };
}

/**
 * Serialize config as CommonJS (`lighthouserc.gen.cjs`) or JSON.
 * @category ProductGenerate
 */
export function formatLighthousercFile(
  config: LighthousercConfig,
  format: "cjs" | "json" = "cjs",
): string {
  if (format === "json") {
    return `${JSON.stringify(config, null, 2)}\n`;
  }
  const body = JSON.stringify(config, null, 2);
  return (
    `/** Generated by mtargets generate lighthouserc — do not edit by hand */\n` +
    `module.exports = ${body};\n`
  );
}

/**
 * Infer output format from path extension.
 * @category ProductGenerate
 */
export function inferLighthousercFormat(outPath: string): "cjs" | "json" {
  if (outPath.toLowerCase().endsWith(".json")) return "json";
  return "cjs";
}
