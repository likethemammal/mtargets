# Full metrics catalog (101 examples)

Complete mtargets indicators — not stubs. Each metric has `kind`, `unit`, `source`, `aggregate`, `window`, a suite **objective**, and a pass observation.

Regenerate from JSON sources:

```bash
npx tsx scripts/generate-metric-catalogs.ts
```

## Bundles

| Catalog / suite | # | Focus |
|-----------------|--:|-------|
| [`catalog-web-ux-perf`](../../examples/catalogs/catalog-web-ux-perf.mtargets.yaml) | 40 | CWV, lab, resources, nav timing, jank, FPS, memory |
| [`catalog-apm-infra`](../../examples/catalogs/catalog-apm-infra.mtargets.yaml) | 21 | RED/USE, latency, host, DB, queues, cold start |
| [`catalog-errors-reliability`](../../examples/catalogs/catalog-errors-reliability.mtargets.yaml) | 15 | Sentry/GlitchTip, crash-free, burn, timeouts, DLQ |
| [`catalog-logging-telemetry`](../../examples/catalogs/catalog-logging-telemetry.mtargets.yaml) | 15 | Log volume, lag, cardinality, traces, MTTR |
| [`catalog-ux-behavior`](../../examples/catalogs/catalog-ux-behavior.mtargets.yaml) | 10 | Rage/dead/error clicks, funnel, bounce |

Suites import the catalog and define **one objective per indicator**.  
Observations: `examples/observations/catalog-*-pass.json`.  
Runs: `examples/runs/catalog-*.mtargets.yaml`.

```bash
npm run demo:catalogs
```

## Source data

Editable definitions live in [`scripts/data/`](../../scripts/data/):

- `catalog-web-ux-perf.json`
- `catalog-apm-infra.json`
- `catalog-errors-reliability.json`
- `catalog-logging-telemetry.json`
- `catalog-ux-behavior.json`

## How each example is shaped

```yaml
# In catalog — full indicator
- id: lcp
  kind: timing
  unit: ms
  higherIsWorse: true
  subjectRef: page
  aggregate: p75
  window: { type: rolling, duration: 28d }
  source:
    type: web-vitals
    query: lcp

# In suite — objective
- id: lcp-obj
  indicator: lcp
  op: lte
  value: 2500
  severity: error
```

Capture/analyze/improve remains: runner collects → `evaluateSuite` → fix product → re-run.
