# Consumers guide

How UI, API, app, and tests share the same mtargets files.

For the full stack (format → library → runners → consumers), see [Product layers](product-layers.md).

## Shared contract

```text
*.mtargets.yaml  ──►  validate  ──►  store / serve
                     │
                     ▼
              runners collect observations
                     │
                     ▼
              evaluateSuite() ──► MetricRun
                     │
         ┌───────────┼───────────┐
         ▼           ▼           ▼
        UI          API         CI gate
```

## API sketch

```http
GET  /v1/metric-suites
GET  /v1/metric-suites/:id
POST /v1/metric-suites/:id/runs
GET  /v1/metric-runs/:id
```

Request body for runs: array of `IndicatorObservation` (or runner-specific payload that maps into it).

Response: `MetricRun` document.

## UI

1. Load `MetricSuite` (and optional `MetricBinding` for routes/grouping).
2. Render subjects → indicators → objectives (group by `labels.channel`).
3. Show latest `MetricRun` status per objective (pass/warn/fail).
4. Deep-link evidence URIs from failing results.

Do not invent thresholds in UI code — edit the suite file (or an editor that writes mtargets).

## Application runtime

- Treat suites as versioned config.
- On schedule or event: collect observations from instrumentation.
- Persist `MetricRun` + evidence blobs.
- Map `severity: warn|error` to notifications / gates using `policy`.

## Tests / CI

From an **outside** repo that depends on `mtargets`:

```bash
npx mtargets validate ./metrics --strict
npx mtargets validate ./metrics --json
```

Or in code:

```ts
import { validateFiles } from "mtargets";
const result = await validateFiles(["./metrics"], { strict: true });
```

Full guide: [validate guide](validate.md).

Also:

```bash
mtargets evaluate metrics/checkout-quality.mtargets.yaml \
  --observations ./tmp/obs.json
# exit 1 if status is fail|error
```

Map runners via `MetricBinding.spec.tests`:

| Runner | Typical indicators |
|--------|-------------------|
| lighthouse-ci | `lighthouse` / `resource-budget` |
| k6 | `http` timings / rates |
| prom | `promql` |
| eval harness | `eval-suite` |
| usage gate | `usage` |

## Observation JSON

```json
[
  { "indicatorId": "lcp", "observed": 2100, "unit": "ms", "samples": { "n": 3 } },
  { "indicatorId": "api_p95", "observed": 320, "compliance": 0.995 }
]
```

| Field | Purpose |
|-------|---------|
| `indicatorId` | Must match suite indicator |
| `observed` | Measured value |
| `compliance` | For `target` / SLO-style objectives |
| `baseline` | For `relative` gates |
| `evidence` | Attachments `{ evidenceId, uri }` |

## Gherkin

Optional human projection — not executable by itself:

```bash
mtargets gherkin suite.mtargets.yaml --out suite.feature
```

## Tool integrations

Lighthouse, Sentry, GlitchTip, custom metrics, and script collectors are **not** embedded in the core library. They plug in as runners that emit observations.

See **[integrations guide](integrations.md)** and `examples/runners/`.
