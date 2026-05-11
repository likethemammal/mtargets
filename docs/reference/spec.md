# mtargets v1 — Specification

**Status:** v1  
**Media types:** `application/mtargets+yaml`, `application/mtargets+json` (informal)  
**Extensions:** `.mtargets.yaml`, `.mtargets.yml`, `.mtargets.json`

This document is normative for **mtargets** document structure and evaluation semantics. **Metric Targets** (npm package `mtargets`) is a reference implementation of this format.

---

## 1. Goals

1. Portable contract for measurable outcomes (not a metrics backend).
2. One object model for UX, reliability, cost, assertions (evals/tests).
3. Consumable by UI, API, application runtime, and CI.
4. Extensible via open `source.type` strings; closed enums for structure.

Non-goals: owning PromQL/LogQL, auth, tenancy, or product IDs in core `spec`.

---

## 2. Document envelope

Every document:

```yaml
apiVersion: mtargets/v1
kind: MetricSuite | MetricRun | MetricCatalog | MetricBinding
metadata: { id, title, ... }
spec: { ... }
```

### 2.1 `metadata`

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | `^[a-z0-9][a-z0-9_-]*$` |
| `title` | yes | Human label |
| `description` | no | |
| `labels` | no | `map<string,string>` |
| `tags` | no | string array |
| `owners` | no | |
| `version` | no | Content semver |
| `createdAt` / `updatedAt` | no | ISO-8601 |

`MetricRun.metadata` additionally requires `suiteId` and may include `suiteVersion`.

---

## 3. MetricSuite

### 3.1 Subjects

What is measured.

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | |
| `type` | yes | `surface\|service\|flow\|agent\|system\|component\|provider\|hook\|unit\|dataset` |
| `selectors` | no | Open map for runners (path, network, story, hook name, …) |

Subject type guide: [subjects guide](../guide/subjects.md).

### 3.2 Indicators

How a quantity is obtained.

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | |
| `kind` | yes | `timing\|ratio\|gauge\|count\|score\|assertion\|histogram` |
| `unit` | yes | e.g. `ms`, `KiB`, `1`, `USD` |
| `source` | yes | `{ type, query?, … }` |
| `aggregate` | no | method or `{ method, percentile? }` |
| `window` | no | shorthand or structured |
| `subjectRef` | conditional | Required if multiple subjects and `scope` ≠ `suite` |
| `scope` | no | `subject` (default) \| `suite` |
| `higherIsWorse` | no | Direction hint |
| `missing` | no | `{ behavior: fail\|warn\|skip\|treat_as, treatAs? }` |

**Recommended `source.type` values:** `web-vitals`, `lighthouse`, `resource-budget`, `promql`, `logql`, `traceql`, `events`, `http`, `sentry`, `glitchtip`, `datadog`, `newrelic`, `usage`, `eval-suite`, `test-report`, `sql`, `custom`, `script`, `manual`, `composite`.

See [integrations guide](../guide/integrations.md) for adapter contracts (Lighthouse, Sentry, GlitchTip, custom scripts).

### 3.3 Objectives

Pass conditions on one indicator.

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | |
| `indicator` | yes | Ref |
| `op` | yes | `lt\|lte\|gt\|gte\|eq\|neq\|in\|not_in\|between` |
| `value` | yes | Number, string, array, or `{min,max}` |
| `severity` | yes | `info\|warn\|error` |
| `target` | no | Compliance fraction `[0,1]` |
| `targetPercent` | no | Alternate; mutually exclusive with `target` |
| `relative` | no | Baseline delta gate |
| `evidenceRefs` | no | |

**Severity:** `info` records only; `warn` → result `warn`; `error` breach → result `fail`.

### 3.4 Composites

| `mode` | Semantics |
|--------|-----------|
| `all` | Every member passes |
| `any` | At least one passes |
| `score` | Weighted pass fraction vs `totalScore.pass` / `.warn` |

Members may set `key: true` (hard fail if that objective fails).

### 3.5 Evidence

| Field | Notes |
|-------|-------|
| `type` | `har\|trace\|logs\|screenshot\|profile\|report\|export\|artifact` |
| `capture` | `on_fail\|always\|on_warn\|never` |
| `required` | If true and capture fails → run/objective `error` (runner policy) |
| `forObjectives` | Optional subset |

### 3.6 Policy

| Field | Default | Notes |
|-------|---------|-------|
| `failOn` | `[fail, error]` | Statuses that fail the suite |
| `warnIsFailure` | `false` | CI strictness |
| `abortOnFail` | `false` | Stop early |
| `minSampleSize` | — | Hint for runners |

---

## 4. MetricRun

Produced by evaluating a suite against observations.

```yaml
spec:
  startedAt: ISO-8601
  finishedAt: ISO-8601
  status: pass | warn | fail | skipped | error
  results: [ { objectiveId, indicatorId, status, observed, ... } ]
  compositeResults: [ ... ]
  summary: { passed, warned, failed, errored, skipped }
```

### Suite status derivation

1. Any `error` in `failOn` → `error`
2. Else any `fail` in `failOn` → `fail`
3. Else any `warn` → `warn` (or `fail` if `warnIsFailure`)
4. Else all `skipped` → `skipped`
5. Else → `pass`

---

## 5. MetricCatalog / MetricBinding

- **Catalog:** reusable subjects, indicators, named sources, evidence.
- **Binding:** maps `suiteId` → UI paths, API resources, test runners (keep product concerns out of suites when possible).

Suite `imports` merge catalog entries; **suite-local ids win** on collision.

---

## 6. Evaluation algorithm (normative)

For each objective:

1. Resolve indicator; load observation by `indicatorId`.
2. If missing → apply `missing.behavior` (default `fail`).
3. Compare `observed` with `op`/`value`.
4. If `target`/`targetPercent` set → require `compliance >= target` (runner-supplied; else absolute outcome as 0/1).
5. If `relative` set → also compare vs baseline; combine with `and`/`or`.
6. Map breach + severity → result status.

Then evaluate composites; derive suite status.

---

## 7. Windows

| Type | Meaning |
|------|---------|
| `rolling` | Last `duration` ending at eval time |
| `calendar` | Calendar period (`day\|week\|month\|quarter`) |
| `run` | Single execution |
| `ci` | One CI job |
| `custom` | Runner-defined |

Shorthand strings: `5m`, `28d`, `run`, `ci`, `month`, etc.

---

## 8. Units (recommended)

`ms`, `s`, `B`, `KiB`, `MiB`, `1` (ratio), `%` (discouraged), ISO 4217 currency codes, `count`, `score`, `tokens`.

---

## 9. Versioning

- Break structure/semantics → `mtargets/v2`.
- New optional fields and `source.type` values → stay on `mtargets/v1`.
- Unknown closed-enum values → validation error.
- Unknown optional object fields → warn / ignore.

---

## 10. Gherkin projection

Non-normative. YAML is source of truth. See `suiteToGherkin()` in the library.

---

## 11. Advanced (v1.5)

Error budgets, ratio SLI shapes, alert policies, stage overlays, sampling, waivers, evidence privacy, interop imports, drift/query checks, and distribution gates are specified in [advanced reference](advanced.md).
