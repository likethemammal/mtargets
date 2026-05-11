# Schema artifacts

Machine-readable schemas live in [`../../schema/`](../../schema/):

| File | Document |
|------|----------|
| `metric-suite.schema.json` | MetricSuite |
| `metric-run.schema.json` | MetricRun |
| `metric-catalog.schema.json` | MetricCatalog |
| `metric-binding.schema.json` | MetricBinding |
| `v0.2.json` | ProductSpec (product-facing targets) |

## Product schema (v0.2)

Compact product files (no `apiVersion` / `kind`) use [`v0.2.json`](../../schema/v0.2.json):

```bash
npx mtargets validate ./examples/comfy-art.mtargets.json --strict
```

```ts
import {
  validateProductSpec,
  normalizeProductSpec,
  resolveProductTiers,
  type ProductSpecDoc,
} from "mtargets";
```

Guide: [Product schema](../guide/product-schema.md). Package export: `mtargets/schema/v0.2.json`.

## Usage

### AJV / other JSON Schema validators

```bash
# example with ajv-cli (optional peer)
npx ajv validate -s schema/metric-suite.schema.json -d examples/suites/checkout-quality.mtargets.yaml
```

YAML must be converted to JSON first for many tools; the mtargets CLI validates via the TypeScript reference rules (which include cross-ref checks JSON Schema alone does not express).

### TypeScript

```ts
import type { MetricSuiteDoc, MetricRunDoc, ProductSpecDoc } from "mtargets";
```

Types in `src/types.ts` / `src/product-types.ts` (and generated API docs under `/api/`) are the canonical TypeScript companion to these schemas. Format semantics: [spec.md](spec.md) (suites) and [product-schema.md](../guide/product-schema.md) (product).

Schema `$id` URIs use the reserved host `mtargets.dev` for future docs hosting; until then resolve schemas from the package `schema/` folder.

### Package export

```json
"mtargets/schema/metric-suite.schema.json"
"mtargets/schema/v0.2.json"
```

## Semantic rules beyond JSON Schema

The reference validator (`validateDocument`) also checks:

- Duplicate ids
- Objective → indicator refs
- Indicator → subject refs (multi-subject suites)
- Composite → objective refs
- Evidence / evidenceRefs consistency
- Mutual exclusion of `target` and `targetPercent`
- `op`/`value` shape pairing (`between`, `in`, …)
- Id pattern `^[a-z0-9][a-z0-9_-]*$`

Product validator (`validateProductSpec`) additionally checks:

- `tiers.good` present (or legacy `target`)
- Direction-consistent tier ordering
- `suite` keys exist in top-level `suites` when that map is present
- `per_route` override shape

Prefer the library validator for CI gates; use JSON Schema for editor autocomplete and external tooling.
