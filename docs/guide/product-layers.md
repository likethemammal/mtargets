# Product layers

How **Metric Targets** (the library) and the **mtargets** file format fit together. The format is the contract; the library interprets it; runners collect; consumers display and gate.

## Naming

| Name | Meaning |
|------|---------|
| **Metric Targets** | TypeScript library + CLI (this package's product name) |
| **mtargets** | npm package id, CLI binary, and file format (`apiVersion: mtargets/v1`, `*.mtargets.yaml`) |

Documentation tooling (Starlight, TypeDoc) explains the product but is not a runtime layer.

## Layer diagram

```text
+-------------------------------------------------------------+
|  Consumers                                                  |
|  UI · your HTTP API · application runtime · CI              |
+---------------------------^---------------------------------+
                            | suites, runs, status
+---------------------------v---------------------------------+
|  Metric Targets  (library + CLI, npm package `mtargets`)    |
|  parse · validate · load · evaluate · gherkin · import      |
+---------------------------^---------------------------------+
                            | operates on
+---------------------------v---------------------------------+
|  mtargets FILE FORMAT  <- shared contract                   |
|  *.mtargets.yaml   apiVersion: mtargets/v1                  |
|  MetricSuite · MetricRun · MetricCatalog · MetricBinding    |
+---------------^-----------------------------^---------------+
                | declares targets            | stores results
+---------------v--------------+   +----------v---------------+
|  Runners / adapters          |   |  Observations            |
|  Lighthouse, Sentry, custom  |-->|  IndicatorObservation[]  |
|  (not shipped in core)       |   +--------------------------+
+------------------------------+
```

**One-line model:** mtargets format = language · Metric Targets = interpreter · runners = sensors · consumers = displays and gates.

---

## 1. mtargets file format (the contract)

Portable YAML or JSON documents. Not tied to a metrics backend, vendor, or product ID.

| Kind | Role |
|------|------|
| `MetricSuite` | Targets: subjects → indicators → objectives (+ composites, evidence, policy, stages, …) |
| `MetricCatalog` | Reusable subjects/indicators imported by suites |
| `MetricBinding` | Optional maps for UI routes / test runners |
| `MetricRun` | One evaluation result (status per objective) |
| **ProductSpec** (v0.2) | Compact product targets (`tiers`, `per_route`, categories) — see [product-schema](product-schema.md) |

Envelope:

```yaml
apiVersion: mtargets/v1
kind: MetricSuite   # or MetricRun | MetricCatalog | MetricBinding
metadata:
  id: checkout-quality
  title: Checkout quality
spec: { ... }
```

**Companions** (same layer, different media):

| Artifact | Purpose |
|----------|---------|
| [Specification](../reference/spec.md) | Normative structure and evaluation semantics |
| [Advanced](../reference/advanced.md) | Error budgets, stages, waivers, drift, … |
| [Schema](../reference/schema.md) / `schema/*.schema.json` | JSON Schema for editors |
| TypeScript types in Metric Targets | `MetricSuiteDoc`, `IndicatorObservation`, … |

Another language could implement validate/evaluate against the same files. **Metric Targets** is a **reference implementation** of the mtargets format, not the format itself.

→ Deep dive: [spec](../reference/spec.md), [product schema](product-schema.md), [subjects](subjects.md), [catalog](catalog.md)

---

## 2. Metric Targets library + CLI (the interpreter)

The `mtargets` npm package (product name **Metric Targets**) turns documents into validated objects and pass/fail runs.

| Capability | Entry points |
|------------|----------------|
| Parse | `parseDocumentText`, load helpers |
| Validate | `validateDocument`, `validateFiles`, `validateProductSpec`, CLI `mtargets validate` |
| Evaluate | `evaluateSuite` → `MetricRun` |
| Stage overlays | `resolveSuiteForStage` |
| Interop | `importOpenSlo`, `importBudgetJson`, `importK6Thresholds` |
| Drift / queries | `checkDrift`, `checkQueries` |
| Projection | `suiteToGherkin` (readability aid; YAML stays source of truth) |

Install and gate CI:

```bash
npm i -D mtargets
npx mtargets validate ./metrics --strict
```

```ts
import { loadSuite, evaluateSuite, validateFiles } from "mtargets";

await validateFiles(["./metrics"], { strict: true });
const { document: suite } = await loadSuite("./checkout.mtargets.yaml");
const run = evaluateSuite(suite, [{ indicatorId: "lcp", observed: 2100 }]);
```

→ [Validate](validate.md) · TypeScript API on the docs site at `/api/`

---

## 3. Runners / adapters (the sensors)

Metric Targets **does not** call Lighthouse, Sentry, PromQL, etc. Runners:

1. Read a `MetricSuite` (and optional `MetricBinding`)
2. Collect values for indicators they understand (`source.type`)
3. Emit `IndicatorObservation[]`
4. Call `evaluateSuite` (or CLI `mtargets evaluate`)
5. Persist or exit on `MetricRun.spec.status`

Credentials stay in env/secret stores; suites only carry opaque `credentialsRef`.

Example adapters live under `examples/runners/` (Lighthouse LHR, Sentry/GlitchTip demo, custom/script).

→ [Integrations](integrations.md)

---

## 4. Consumers (displays and gates)

Anything that **reads** suites/runs without collecting metrics:

| Consumer | Typical use |
|----------|-------------|
| **UI** | Render subjects/objectives; show latest run status; link evidence |
| **HTTP API** | Store suites; accept observations; return `MetricRun` |
| **App runtime** | Scheduled evaluation; map severity to alerts |
| **CI** | `mtargets validate` / `evaluate`; fail the job on `fail` \| `error` |

Do not hard-code thresholds in UI or CI scripts — change the suite file (or an editor that writes mtargets).

→ [Consumers](consumers.md)

---

## End-to-end path

1. Author `checkout-quality.mtargets.yaml` (**mtargets format**).
2. CI runs `mtargets validate` (**Metric Targets**).
3. Lighthouse (or other) adapter produces observations (**runner**).
4. `evaluateSuite` writes a `MetricRun` (**mtargets format** again).
5. Dashboard and CI read `run.spec.status` (**consumers**).

```text
Suite YAML  →  validate  →  runner observations  →  evaluateSuite  →  MetricRun
                                                                      |
                                                         UI / API / CI <┘
```

---

## What is *not* a product layer

| Concern | Where it lives |
|---------|----------------|
| Starlight docs site | `website/` — presents guides and embeds TypeDoc |
| Guide / spec markdown sources | `docs/guide/`, `docs/reference/` |
| TypeDoc HTML | Generated into `website/public/api/` |
| Example suites and demos | `examples/` — illustrations, not required at runtime |

Those explain or demonstrate the product; they are not part of the runtime contract.

---

## Related guides

| Guide | Focus |
|-------|--------|
| [Validate](validate.md) | CI and `validateFiles` |
| [Consumers](consumers.md) | UI / API / app / CI wiring |
| [Integrations](integrations.md) | Adapter contract and vendors |
| [Subjects](subjects.md) | What you measure (page, component, network, …) |
| [Specification](../reference/spec.md) | Normative mtargets format rules |
