# mtargets

[![CI](https://github.com/likethemammal/mtargets/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/likethemammal/mtargets/actions/workflows/ci.yml?query=branch%3Amain)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](./package.json)
[![Docs](https://img.shields.io/badge/docs-Node%2022%2B-lightgrey.svg)](./website/package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)](./tsconfig.json)

**Metric Targets** — TypeScript library and CLI for the **mtargets** file format: measurable quality targets (UX, reliability, cost, evals, tests) as a shared contract for UI, API, app, and CI.

| Name | What |
|------|------|
| **Metric Targets** | The library (API + CLI) |
| **mtargets** | npm package, CLI binary, and file format (`apiVersion: mtargets/v1`, `*.mtargets.yaml`) |

Not tied to any product. Inspired by OpenSLO, Lighthouse budgets, k6 thresholds, and Grafana OATs.

## Install

```bash
npm i -D mtargets
npx mtargets validate ./metrics --strict
```

Local checkout (this repo):

```bash
npm install
npm run build
npm test
```

From another package via path (build `dist/` first):

```bash
npm i -D file:../mtargets
```

## Quick start

```bash
npx mtargets validate ./examples --strict

npx mtargets evaluate examples/suites/checkout-quality.mtargets.yaml \
  --observations examples/observations/checkout-pass.json

npx mtargets gherkin examples/suites/checkout-quality.mtargets.yaml
```

Programmatic (Metric Targets API):

```ts
import { loadSuite, evaluateSuite, validateFiles } from "mtargets";

const result = await validateFiles(["./metrics"], { strict: true });
if (!result.ok) process.exit(1);

const { document: suite } = await loadSuite("./checkout-quality.mtargets.yaml");
const run = evaluateSuite(suite, [
  { indicatorId: "lcp", observed: 2100 },
  { indicatorId: "cls", observed: 0.04 },
]);
console.log(run.spec.status); // pass | warn | fail | error | skipped
```

Full validate guide: [docs/guide/validate.md](docs/guide/validate.md).

## Document kinds

| Kind | File role |
|------|-----------|
| `MetricSuite` | Targets: subjects, indicators, objectives, evidence |
| `MetricRun` | One evaluation result |
| `MetricCatalog` | Shared reusable subjects/indicators |
| `MetricBinding` | Optional UI/API/test runner maps |
| **ProductSpec** (v0.2) | Compact product targets: `tiers`, `per_route`, `category`, … |

Suite documents use `apiVersion: mtargets/v1` and `*.mtargets.yaml`. Product specs use `$schema: https://mtargets.dev/schema/v0.2.json` (JSON); see [docs/guide/product-schema.md](docs/guide/product-schema.md).

### Product schema quick look

```json
{
  "$schema": "https://mtargets.dev/schema/v0.2.json",
  "name": "my-app",
  "metrics": {
    "lcp": {
      "category": "cwv",
      "unit": "ms",
      "percentile": "p75",
      "source": "rum",
      "tiers": { "good": 2500, "warn": 4000 },
      "per_route": {
        "/home": { "baseline": 1800 }
      }
    },
    "lighthouse-perf": {
      "category": "perf",
      "direction": "higher-is-better",
      "tiers": { "good": 90, "warn": 75 }
    }
  }
}
```

Full example: [`examples/comfy-art.mtargets.json`](examples/comfy-art.mtargets.json).

## Core model

```text
Subject → Indicator → Objective (+ Composite) → Evidence
                ↓
         Runner / adapter (Lighthouse, Sentry, …)
                ↓
         IndicatorObservation[]
                ↓
            MetricRun
```

## Documentation

Docs site is **Astro Starlight** (`website/`). Edit source under `docs/guide/` and `docs/reference/`.

```bash
npm run docs:dev      # sync + TypeDoc + Starlight → http://localhost:4321
npm run docs:build    # production → website/dist
```

See [docs/README.md](docs/README.md).

| Doc | Topic |
|-----|-------|
| [docs/guide/product-layers.md](docs/guide/product-layers.md) | Format · library · runners · consumers |
| [docs/guide/product-schema.md](docs/guide/product-schema.md) | Product v0.2: tiers, routes, categories, AI metrics, integrations |
| [docs/guide/validate.md](docs/guide/validate.md) | CLI + `validateFiles` |
| [docs/guide/consumers.md](docs/guide/consumers.md) | UI / API / app / CI |
| [docs/guide/integrations.md](docs/guide/integrations.md) | Lighthouse, Sentry, GlitchTip, custom |
| [docs/guide/subjects.md](docs/guide/subjects.md) | Pages, components, hooks, networks |
| [docs/guide/catalog.md](docs/guide/catalog.md) | 101 catalog metrics |
| [docs/reference/spec.md](docs/reference/spec.md) | Normative format |
| [docs/reference/advanced.md](docs/reference/advanced.md) | Error budgets, stages, waivers, … |
| [docs/reference/schema.md](docs/reference/schema.md) | JSON Schema (suites + product v0.2) |
| `/api/` on docs site | Metric Targets TypeDoc API |
| [CHANGELOG.md](CHANGELOG.md) | Releases |

## Develop

```bash
npm run build
npm test
npm run validate:examples
npm run docs:dev
npm run demo:all
```

| Script | Purpose |
|--------|---------|
| `npm run build` | Compile TypeScript → `dist/` |
| `npm test` | Unit tests |
| `npm run docs:dev` | Starlight docs site |
| `npm run docs:build` | Static docs → `website/dist/` |
| `npm run demo:*` | Example adapters |

## License

Apache-2.0
