/**
 * mtargets product schema v0.2 — TypeScript types.
 *
 * Product-facing metric targets (e.g. comfy-art.mtargets.json).
 * Distinct from MetricSuite documents (`apiVersion: mtargets/v1`).
 *
 * @see https://mtargets.dev/schema/v0.2.json
 * @category ProductSchema
 */

/** Schema $id / version marker for product files. @category ProductSchema */
export const PRODUCT_SCHEMA_VERSION = "0.2" as const;

/** @category ProductSchema */
export const PRODUCT_SCHEMA_ID = "https://mtargets.dev/schema/v0.2.json" as const;

/** @category ProductSchema */
export type ProductPercentile = "p75" | "p95" | "p50" | "median";

/** @category ProductSchema */
export type ProductMetricSource = "rum" | "synthetic" | "custom" | "server";

/** @category ProductSchema */
export type ProductCategory =
  | "cwv"
  | "perf"
  | "generation"
  | "ux"
  | "error"
  | "network";

/**
 * Comparison direction for tier evaluation.
 * Default when omitted: `lower-is-better`.
 * @category ProductSchema
 */
export type ProductDirection = "lower-is-better" | "higher-is-better";

/**
 * Three-tier threshold model (Google CWV style).
 * Values at/better than `good` pass; between good and warn → warn; beyond warn → fail.
 * @category ProductSchema
 */
export interface ProductTiers {
  /** Passing threshold (replaces legacy single `target`). */
  good: number;
  /** Warning zone bound. */
  warn?: number;
}

/**
 * Route-scoped override of tiers / baseline / percentile / direction.
 * @category ProductSchema
 */
export interface ProductRouteOverride {
  tiers?: Partial<ProductTiers>;
  baseline?: number;
  percentile?: ProductPercentile;
  direction?: ProductDirection;
  /** Legacy alias for tiers.good (normalized away). */
  target?: number;
  /** Legacy alias for tiers.warn (normalized away). */
  warning?: number;
}

/**
 * One metric entry under `metrics` (or legacy `targets`).
 * @category ProductSchema
 */
export interface ProductMetric {
  label?: string;
  /** Legacy v0.1 alias for label. */
  description?: string;
  category?: ProductCategory;
  unit?: string;
  percentile?: ProductPercentile;
  source?: ProductMetricSource;
  collect?: string;
  /** Suite key; should exist in top-level `suites` when that map is present. */
  suite?: string;
  direction?: ProductDirection;
  /** Last captured actual (written by `mtargets baseline`). */
  baseline?: number;
  note?: string;
  tiers?: ProductTiers;
  /** Legacy v0.1 — maps to tiers.good. */
  target?: number;
  /** Legacy v0.1 — maps to tiers.warn. */
  warning?: number;
  /** Legacy v0.1 — informational only in v0.2. */
  critical?: number;
  per_route?: Record<string, ProductRouteOverride>;
}

/**
 * Normalized metric: tiers.good always present; legacy fields removed.
 * @category ProductSchema
 */
export interface NormalizedProductMetric {
  label?: string;
  category?: ProductCategory;
  unit?: string;
  percentile?: ProductPercentile;
  source?: ProductMetricSource;
  collect?: string;
  suite?: string;
  direction: ProductDirection;
  baseline?: number;
  note?: string;
  tiers: ProductTiers;
  per_route?: Record<
    string,
    {
      tiers: ProductTiers;
      baseline?: number;
      percentile?: ProductPercentile;
      direction?: ProductDirection;
    }
  >;
}

/**
 * Raw product document (v0.1 or v0.2 shape before normalize).
 * @category ProductSchema
 */
export interface ProductSpecDoc {
  $schema?: string;
  name: string;
  version?: string;
  description?: string;
  /** Optional product/host identifier (not metric source enum). */
  source?: string;
  suites?: Record<string, string>;
  metrics?: Record<string, ProductMetric>;
  /** Legacy v0.1 alias for metrics. */
  targets?: Record<string, ProductMetric>;
}

/**
 * Normalized product document ready for validate CLI / evaluation.
 * @category ProductSchema
 */
export interface NormalizedProductSpec {
  $schema: typeof PRODUCT_SCHEMA_ID;
  name: string;
  version?: string;
  description?: string;
  source?: string;
  suites?: Record<string, string>;
  metrics: Record<string, NormalizedProductMetric>;
}
