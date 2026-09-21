# Product schema (v0.2)

Product-facing metric targets files (e.g. `comfy-art.mtargets.json`) use a compact JSON shape distinct from `MetricSuite` documents (`apiVersion: mtargets/v1`).

| Artifact | Role |
|----------|------|
| [`schema/v0.2.json`](../../schema/v0.2.json) | JSON Schema |
| `validateProductSpec` / `normalizeProductSpec` / `resolveProductTiers` | TypeScript API |
| [`examples/comfy-art.mtargets.json`](../../examples/comfy-art.mtargets.json) | Full real-world example |
| [`examples/product/`](../../examples/product/) | Minimal v0.2 + legacy v0.1 |

Validate with the same CLI path as suites:

```bash
npx mtargets validate ./examples/comfy-art.mtargets.json --strict
```

---

## Three-tier thresholds

Prefer `tiers` over a single `target`:

```json
{
  "lcp": {
    "label": "Largest Contentful Paint",
    "unit": "ms",
    "direction": "lower-is-better",
    "tiers": { "good": 2500, "warn": 4000 }
  }
}
```

| Zone | Meaning |
|------|---------|
| at/better than `good` | **pass** |
| between `good` and `warn` | **warn** |
| beyond `warn` | **fail** (critical) |

Legacy v0.1 files still work: `target` → `tiers.good`, `warning` → `tiers.warn`. Prefer `tiers` in new files.

---

## Route-scoped metrics (`per_route`)

Pages often have very different baselines. Scope overrides under `per_route`:

```json
{
  "lcp": {
    "tiers": { "good": 2500, "warn": 4000 },
    "per_route": {
      "/rating": {
        "tiers": { "good": 2500, "warn": 4000 },
        "baseline": 1200
      },
      "/curation/styles": {
        "tiers": { "good": 2500, "warn": 4000 },
        "baseline": 3900
      },
      "/scheduling/sched-*": {
        "tiers": { "good": 2500, "warn": 4000 },
        "baseline": 276
      }
    }
  }
}
```

Resolve effective tiers in code:

```ts
import { assertValidProductSpec, resolveProductTiers } from "mtargets";
import raw from "./comfy-art.mtargets.json" with { type: "json" };

const spec = assertValidProductSpec(raw);
const rating = resolveProductTiers(spec.metrics.lcp, "/rating");
// → { good: 2500, warn: 4000 }
```

Route keys are opaque strings (exact paths or glob-like labels your collector understands).

---

## Category taxonomy

| `category` | Typical metrics | Triage hint |
|------------|-----------------|-------------|
| `cwv` | LCP, INP, CLS, TTFB, FCP | User-visible web vitals |
| `perf` | Lighthouse score, TBT, LoAF, batch load | Broader performance |
| `generation` | TTFR, queue wait, failure rate | AI / long-running pipelines |
| `ux` | Action latency, mount time, form abandon | Interaction quality |
| `error` | JS/API error rates, failed images | Stability |
| `network` | Cache hit rate, slow fetches, bundle size | Resources / transport |

Failing `cwv` usually escalates differently from failing `generation` — keep categories consistent so auto-triage and agents can route correctly.

---

## Source and percentile

| Field | Allowed values | Purpose |
|-------|----------------|---------|
| `source` | `rum` \| `synthetic` \| `custom` \| `server` | How the number was collected |
| `percentile` | `p75` \| `p95` \| `p50` \| `median` | Which distribution point `tiers` apply to |

Example: `"percentile": "p75", "source": "rum"` means **good ≤ 2500ms on the 75th percentile of real sessions**, not a single lab run.

Optional `collect` is a free-form string describing the SDK/API (for humans and agents).

---

## Direction (`higher-is-better`)

Default is `lower-is-better` (latency, error rate). Scores and rates that improve upward need an explicit direction:

```json
{
  "lighthouse-perf": {
    "label": "Lighthouse Performance Score",
    "category": "perf",
    "unit": "score",
    "percentile": "median",
    "source": "synthetic",
    "direction": "higher-is-better",
    "tiers": { "good": 90, "warn": 75 }
  }
}
```

Same pattern for FPS, cache hit rate, accessibility scores. For `higher-is-better`, `warn` must be **worse** than `good` (e.g. good 90, warn 75). The validator rejects inverted tiers.

---

## AI / long-running operations

Generation pipelines are first-class: long millisecond thresholds and rate units are normal.

```json
{
  "ttfr": {
    "label": "Time to First Result",
    "category": "generation",
    "suite": "generation",
    "unit": "ms",
    "percentile": "p95",
    "source": "server",
    "tiers": { "good": 15000, "warn": 30000 },
    "note": "Threshold varies by model/checkpoint — per-model breakdown recommended"
  },
  "generation-failure-rate": {
    "label": "Generation failure rate (24h)",
    "category": "generation",
    "suite": "generation",
    "unit": "percent",
    "source": "server",
    "tiers": { "good": 2, "warn": 5 }
  }
}
```

Tips:

- **Long `good` values** (15s TTFR) are expected — do not force web-vitals-scale budgets.
- **Rate metrics** use `unit: "percent"` or `"rate"` alongside ms metrics in the same file.
- Use `note` (or separate metric keys) for per-model / per-checkpoint breakdowns.

See the full file: [`examples/comfy-art.mtargets.json`](../../examples/comfy-art.mtargets.json).

---

## Integration examples

Product specs are a single source of truth for triage scripts, CI assertions, and agent reports.

### 1. Feeding auto-triage scripts

Replace hardcoded constants with the normalized spec:

```ts
import { readFileSync } from "node:fs";
import { assertValidProductSpec, resolveProductTiers } from "mtargets";

const spec = assertValidProductSpec(
  JSON.parse(readFileSync("./comfy-art.mtargets.json", "utf8")),
);

function checkMetric(
  key: string,
  actual: number,
  route?: string,
): "pass" | "warn" | "fail" {
  const metric = spec.metrics[key];
  const tiers = resolveProductTiers(metric, route);
  const higher = metric.direction === "higher-is-better";

  if (higher) {
    if (actual >= tiers.good) return "pass";
    if (tiers.warn !== undefined && actual >= tiers.warn) return "warn";
    return "fail";
  }
  if (actual <= tiers.good) return "pass";
  if (tiers.warn !== undefined && actual <= tiers.warn) return "warn";
  return "fail";
}
```

### 2. Generating CI / Lighthouse config

Derive assertion blocks from CWV and score metrics:

```ts
import { assertValidProductSpec } from "mtargets";
import raw from "./comfy-art.mtargets.json" with { type: "json" };

const spec = assertValidProductSpec(raw);
const cwv = spec.metrics;

export default {
  ci: {
    assert: {
      assertions: {
        "categories:performance": [
          "error",
          { minScore: cwv["lighthouse-perf"].tiers.good / 100 },
        ],
        "audits/largest-contentful-paint": [
          "warn",
          { maxNumericValue: cwv.lcp.tiers.good },
        ],
        "audits/cumulative-layout-shift": [
          "error",
          { maxNumericValue: cwv.cls.tiers.good },
        ],
      },
    },
  },
};
```

### 3. Agent-readable reports

Consumers (including Paperclip agents) should emit a structured evaluation summary. Example shape:

```json
{
  "spec": "comfy-art-dashboard@0.1.0",
  "evaluatedAt": "2026-07-10T22:17:00Z",
  "summary": { "pass": 8, "warn": 3, "fail": 1, "noData": 2 },
  "results": [
    {
      "key": "lcp",
      "route": "/curation/styles",
      "actual": 3900,
      "percentile": "p75",
      "tiers": { "good": 2500, "warn": 4000 },
      "status": "warn",
      "delta_from_baseline": 0
    }
  ]
}
```

How to interpret `status`:

| Status | Meaning | Typical agent action |
|--------|---------|----------------------|
| `pass` | at/better than `good` | No action |
| `warn` | between `good` and `warn` | File/triage issue; investigate trend |
| `fail` | beyond `warn` | Escalate; treat as incident-worthy |
| `noData` | missing observation | Check collector / window |

---

## Related

- [Product layers](product-layers.md) — format vs library vs runners
- [Schema artifacts](../reference/schema.md) — JSON Schema index
- [Validate](validate.md) — CLI + `validateFiles`
