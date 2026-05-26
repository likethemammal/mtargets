# Integrations — runners & adapters

mtargets declares **targets**. Tools like Lighthouse, Sentry, and GlitchTip **collect observations**. Adapters sit in between.

```text
MetricSuite (source.type + query)
        │
        ▼
   Runner / adapter          ← this doc
   (LHCI, Sentry API, …)
        │
        ▼
IndicatorObservation[]
        │
        ▼
evaluateSuite() → MetricRun
```

**Metric Targets** (the `mtargets` package) does **not** call vendor APIs. Example runners live under [`examples/runners/`](../../examples/runners/).

---

## Adapter contract

Every runner MUST:

1. Load a `MetricSuite` (and optional `MetricBinding`).
2. For each indicator whose `source.type` it understands, collect a value.
3. Emit `IndicatorObservation[]`:

```ts
{
  indicatorId: string;       // must match suite indicator id
  observed: number | string | boolean | null;
  unit?: string;
  compliance?: number;       // 0–1 when objective.target is used
  baseline?: number | string | null;
  samples?: { n: number };
  evidence?: [{ evidenceId: string; uri: string }];
  message?: string;
}
```

4. Call `evaluateSuite(suite, observations)` (or `mtargets evaluate --observations …`).
5. Exit non-zero when `MetricRun.spec.status` is `fail` or `error` (unless policy says otherwise).

Unknown `source.type` values: skip or fail per runner policy; document which.

Credentials: use env vars / secret stores. Suites may only carry `source.credentialsRef` (opaque id), never secrets.

---

## Source type registry

| `source.type` | Typical tool | `query` meaning |
|---------------|--------------|-----------------|
| `lighthouse` | Lighthouse / LHCI | Audit id or category (`largest-contentful-paint`, `categories:performance`) |
| `resource-budget` | Lighthouse budgets | `script.transferSize`, `third-party.count`, … |
| `web-vitals` | RUM / `web-vitals` lib | `lcp`, `inp`, `cls`, … |
| `sentry` | Sentry API | Issue/event search or stats query string |
| `glitchtip` | GlitchTip (Sentry-compatible) | Same shape as `sentry`; different base URL / DSN host |
| `datadog` | Datadog | Metric query |
| `promql` / `logql` / `traceql` | Prometheus / Loki / Tempo | Query language string |
| `events` | Analytics / app events | Filter object or DSL |
| `http` | Synthetic check | URL / method object |
| `usage` | Billing / token meters | `cost`, `tokens`, … |
| `eval-suite` / `test-report` | Eval harness / JUnit | Suite or report id |
| `sql` | Warehouse | SQL |
| `custom` | Your product metric | Free-form id + `params` |
| `script` | Shell/Node collector | Command or module path in `params` |
| `manual` | Human entry | n/a |

`sentry` vs `glitchtip`: same observation mapping; runners differ only by API base URL (GlitchTip speaks the Sentry ingest/API subset).

---

## Lighthouse / Lighthouse CI

### Suite snippet

```yaml
indicators:
  - id: lcp
    kind: timing
    unit: ms
    higherIsWorse: true
    subjectRef: home
    aggregate: p75
    window: ci
    source:
      type: lighthouse
      query: largest-contentful-paint
  - id: perf-score
    kind: score
    unit: score
    higherIsWorse: false
    subjectRef: home
    aggregate: avg
    window: ci
    source:
      type: lighthouse
      query: categories:performance
  - id: js-kib
    kind: gauge
    unit: KiB
    higherIsWorse: true
    subjectRef: home
    source:
      type: resource-budget
      query: script.transferSize
objectives:
  - id: lcp-good
    indicator: lcp
    op: lte
    value: 2500
    severity: error
  - id: perf-floor
    indicator: perf-score
    op: gte
    value: 0.9
    severity: error
```

### Binding

```yaml
tests:
  - runner: lighthouse-ci
    maps:
      lcp: largest-contentful-paint
      perf-score: categories:performance
      js-kib: resource-summary:script:size
```

### Adapter flow

1. Run `lhci autorun` or `lighthouse <url> --output=json`.
2. Read LHR JSON → map audit `numericValue` (ms) or category `score` (0–1).
3. For resource budgets, convert bytes → KiB if suite `unit` is `KiB`.
4. Attach evidence: `{ evidenceId: "lhr", uri: "file://./lhr.json" }`.

See [`examples/runners/lighthouse-adapter.ts`](../../examples/runners/lighthouse-adapter.ts) and [`examples/suites/lighthouse-ci.mtargets.yaml`](../../examples/suites/lighthouse-ci.mtargets.yaml).

---

## Sentry

### Suite snippet

```yaml
indicators:
  - id: error_event_rate
    kind: ratio
    unit: "1"
    higherIsWorse: true
    subjectRef: api
    aggregate: rate
    window: { type: rolling, duration: 24h }
    source:
      type: sentry
      query: "is:unresolved event.type:error"
      params:
        project: checkout
        environment: production
        stat: events_per_minute
      credentialsRef: sentry-api-token
  - id: unresolved_issues
    kind: count
    unit: count
    higherIsWorse: true
    subjectRef: api
    aggregate: last
    source:
      type: sentry
      query: "is:unresolved"
      params:
        project: checkout
        metric: issue_count
objectives:
  - id: errors-slo
    indicator: error_event_rate
    op: lt
    value: 0.01
    severity: error
  - id: issue-backlog
    indicator: unresolved_issues
    op: lte
    value: 25
    severity: warn
```

### Adapter flow

1. `GET /api/0/projects/{org}/{project}/stats/` or Issues search API with the suite `query`.
2. Normalize to a single number (rate, count, p95 of transaction, …).
3. Auth via `SENTRY_AUTH_TOKEN` (map from `credentialsRef`).

Example: [`examples/runners/sentry-adapter.ts`](../../examples/runners/sentry-adapter.ts).

---

## GlitchTip

GlitchTip accepts Sentry SDKs and a Sentry-like API. Prefer `source.type: glitchtip` so bindings can point at a different host without rewriting queries.

```yaml
source:
  type: glitchtip
  query: "is:unresolved event.type:error"
  params:
    project: checkout
    baseUrlEnv: GLITCHTIP_URL   # e.g. https://glitchtip.example.com
  credentialsRef: glitchtip-token
```

Runner: same mapping as Sentry; set `GLITCHTIP_URL` + `GLITCHTIP_TOKEN` (see [`examples/runners/glitchtip-adapter.ts`](../../examples/runners/glitchtip-adapter.ts)).

---

## Custom metrics, targets, sources, scripts

Use `custom` or `script` when the metric is product-specific.

### Custom product metric

```yaml
indicators:
  - id: brief_time_to_green
    title: P75 minutes Brief → green Trace
    kind: timing
    unit: s
    higherIsWorse: true
    scope: suite
    aggregate: p75
    window: { type: rolling, duration: 7d }
    source:
      type: custom
      query: dx.brief_time_to_green
      params:
        table: analytics.brief_cycle
        percentile: 75
objectives:
  - id: ttg-target
    indicator: brief_time_to_green
    op: lte
    value: 900          # 15 minutes
    severity: warn
    labels: { channel: dx }
```

### Script-backed collector

```yaml
indicators:
  - id: queue_depth
    kind: gauge
    unit: count
    higherIsWorse: true
    source:
      type: script
      query: queue_depth
      params:
        module: ./collectors/queue-depth.mjs
        args: ["--queue", "needs-you"]
```

The `script` runner dynamically imports `params.module` and expects:

```ts
export async function collect(ctx: {
  indicatorId: string;
  query?: string | object;
  params?: Record<string, unknown>;
}): Promise<{ observed: number; unit?: string; evidence?: ... }>
```

See [`examples/suites/custom-product.mtargets.yaml`](../../examples/suites/custom-product.mtargets.yaml) and [`examples/runners/custom-adapter.ts`](../../examples/runners/custom-adapter.ts).

### Soft vs hard targets (same indicator)

```yaml
objectives:
  - id: spend-soft
    indicator: monthly_spend
    op: lte
    value: 100
    severity: warn
  - id: spend-hard
    indicator: monthly_spend
    op: lte
    value: 150
    severity: error
```

---

## Wiring in CI

```yaml
# conceptual
- run: npx tsx examples/runners/lighthouse-adapter.ts \
    --suite examples/suites/lighthouse-ci.mtargets.yaml \
    --lhr ./tmp/lhr.json \
    --out ./tmp/run.mtargets.yaml
- run: mtargets evaluate ...   # optional if adapter already evaluates
```

Or: adapter writes `observations.json` → `mtargets evaluate suite.mtargets.yaml --observations observations.json`.

---

## Adding a new tool

1. Pick or invent a `source.type` string; add to your org catalog if useful.
2. Document `query` / `params` shape in a short adapter README.
3. Implement collect → `IndicatorObservation[]`.
4. Register the runner name in a `MetricBinding`.
5. Keep secrets out of YAML.

No mtargets `apiVersion` bump is required for new source types.

---

## Pages, components, networks, jank, memory

Subject scoping (page vs component vs provider vs hook) and networking conditions are documented in **[subjects guide](subjects.md)**.

**101 full metric examples** (web, APM, errors, logging, UX behavior): **[metrics catalog](catalog.md)**.

Example suites:

- `examples/suites/ux-granularity.mtargets.yaml`
- `examples/suites/network-conditions.mtargets.yaml`
- `examples/suites/api-data.mtargets.yaml`
- `examples/suites/catalog-*.mtargets.yaml`

**Product schema consumers** (auto-triage, LHCI generation, agent reports): see **[product schema](product-schema.md)** and `examples/comfy-art.mtargets.json`.
