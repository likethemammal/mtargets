# Advanced capabilities (normative)

This document covers reliability/ops capabilities (introduced in 1.5.0). Normative alongside [spec.md](spec.md). Core envelope remains `apiVersion: mtargets/v1`.

See also the worked example: [`examples/suites/advanced-reliability-ux.mtargets.yaml`](../../examples/suites/advanced-reliability-ux.mtargets.yaml).

---

## 1. Error budgets

On any objective:

```yaml
errorBudget:
  budgetingMethod: Occurrences   # or Timeslices
  target: 0.999                  # SLO good fraction
  window: 30d
  burnRates:
    - id: fast-burn
      window: 1h
      maxBurnRate: 14.4
      severity: error
```

Runners attach:

```json
{
  "indicatorId": "availability",
  "observed": 0.9995,
  "errorBudget": {
    "remaining": 0.4,
    "burnRates": [{ "window": "1h", "burnRate": 2.0, "alertId": "fast-burn" }]
  }
}
```

Evaluation fails/warns when burn exceeds `maxBurnRate` or remaining &lt; 0. If only `compliance` is supplied, it is compared to `errorBudget.target`.

---

## 2. Ratio SLIs (good / bad / total)

```yaml
kind: ratio
source:
  type: promql
  good: sum(rate(http_requests_total{status!~"5.."}[5m]))
  total: sum(rate(http_requests_total[5m]))
```

Or `bad`+`total`, or `rawType: success|failure` with `query`. Validation **errors** if a ratio has none of these shapes (query-only is a warning).

Runners may send `{ ratio: { good, bad, total } }` instead of a precomputed `observed`.

---

## 3. Alert policies

Distinct from CI `policy.failOn` — for paging / tickets:

```yaml
alertPolicies:
  - id: page-on-burn
    forObjectives: [availability-slo]
    conditions:
      - onStatus: [fail, error]
        severity: error
      - budgetRemainingBelow: 0.1
        severity: warn
    notify:
      method: page
      channelsRef: oncall-checkout
```

Fires are recorded on `MetricRun.spec.alertsFired`.

---

## 4. Interop

```bash
mtargets import openslo ./slo.yaml --out ./suite.mtargets.yaml
mtargets import budget ./budget.json --out ./lh.mtargets.yaml
mtargets import k6 ./thresholds.json --out ./k6.mtargets.yaml
```

Programmatic: `importOpenSlo`, `importBudgetJson`, `importK6Thresholds`.

---

## 5. Stages / promotion overlays

```yaml
stages:
  - id: staging
    objectiveOverrides:
      - objectiveId: availability-slo
        target: 0.99
  - id: prod
    inherits: staging
    policy: { warnIsFailure: true }
    objectiveOverrides:
      - objectiveId: availability-slo
        target: 0.999
```

```bash
mtargets evaluate suite.mtargets.yaml --observations obs.json --stage prod
```

Or `evaluateSuite(suite, obs, { stage: "prod" })` / `resolveSuiteForStage`.

---

## 6. Statistical honesty

```yaml
policy:
  sampling:
    minSampleSize: 100
    onInsufficient: warn   # fail | warn | skip
    coldStart: exclude
    requireDimensions: [device, network]
    confidence: 0.95
```

Also allowed on `defaults.sampling` and per-indicator `sampling`. Observations should include `samples: { n, dimensions: { ... } }`.

---

## 7. Waivers (change management)

```yaml
waivers:
  - id: waiver-lcp-q3
    objectiveIds: [lcp-good]
    reason: Known CDN regression
    approvedBy: sre-lead@example.com
    expiresAt: "2026-07-18T00:00:00Z"
    statusOverride: warn   # skip | warn | pass
    ticketRef: INC-1234
```

Active waivers (unexpired) rewrite fail/error results.

---

## 8. Evidence privacy

```yaml
evidence:
  - id: har-on-fail
    type: har
    privacy:
      allowPii: false
      classification: internal
      retention: 7d
      redact: [cookies, authorization, email]
policy:
  privacy:
    allowPii: false
    retention: 14d
```

Runners should set `privacyApplied: true` on attachments when redaction ran.

---

## 9. Drift + query checks

No live backend calls in core — structural / declared-vs-expected:

```bash
mtargets check-queries suite.mtargets.yaml
mtargets drift suite.mtargets.yaml --live live-alerts.json
```

`live-alerts.json` is an array of `{ id, op?, value?, severity? }` (see `suiteToAlertSnapshot`).

---

## 10. Distribution objectives

```yaml
distribution:
  percentiles:
    - { p: 95, op: lte, value: 300 }
    - { p: 99, op: lte, value: 800 }
  buckets:
    - { le: 0.5, op: gte, value: 0.99 }
```

Observation:

```json
{
  "distribution": {
    "percentiles": { "95": 280, "99": 750 },
    "buckets": { "0.5": 0.995 }
  }
}
```

All listed gates are AND’d with the primary `op`/`value` when a scalar `observed` is also present.
