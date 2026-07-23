# Changelog

## 1.11.0

- CLI: `mtargets generate lighthouserc --spec … --out …` — LHCI assertions from CWV + lighthouse product metrics
- CLI: `mtargets report --spec … --data … --format agent-markdown|json` — validate internally, markdown table for Paperclip
- Library: `generateLighthousercConfig`, `formatAgentMarkdown` (uses `validateProductActuals`)
- Also includes product `validate --spec` / `baseline` core used by report

## 1.10.0

- Product schema **v0.2** (`schema/v0.2.json`): `tiers`, `per_route`, `percentile`, `source`, `category`, `suite`, `direction`, `baseline`
- TypeScript: `validateProductSpec`, `normalizeProductSpec`, `resolveProductTiers` (+ types)
- Backwards-compatible with v0.1 files (`targets` map, `target` → `tiers.good`, `warning` → `tiers.warn`)
- Examples: `examples/product/v0.2-minimal.mtargets.json`, `examples/product/v0.1-legacy.mtargets.json`, `examples/comfy-art.mtargets.json`
- Docs: [docs/guide/product-schema.md](docs/guide/product-schema.md) — tiers, routes, categories, AI metrics, `direction`, integration patterns
- `validateFiles` / example walker recognize `ProductSpec` documents

## 1.9.0

- Docs site: **Astro Starlight** in `website/` (guides + reference + splash)
- `npm run docs:dev` / `docs:build` sync markdown and embed TypeDoc at `/api/`
- Source of truth for narrative docs remains `docs/guide/` and `docs/reference/`
- Guide: [Product layers](docs/guide/product-layers.md) — format, library, runners, consumers
- Branding: library **Metric Targets**; package/format/CLI **mtargets**

## 1.8.1

- Removed deprecated `expandMtsInputs` (use `expandMtargetsInputs`)
- TypeDoc categories for types/constants: Documents, Model, Enums, Constants (no more dump into Other)

## 1.8.0

- Docs reorganized for a docs site: `docs/guide/`, `docs/reference/`, generated `docs/api/` (TypeDoc)
- Public API: `expandMtargetsInputs`
- Package marked `private: true` until first remote publish; CI workflow added
- Root [CHANGELOG.md](CHANGELOG.md); LICENSE copyright updated

## 1.7.0

- Package/format/CLI/files are **mtargets** (`apiVersion: mtargets/v1`, `*.mtargets.yaml`, CLI `mtargets`)

## 1.6.0

- Intermediate longer branding (superseded by 1.7.0 short name)

## 1.5.0

- Error budgets + multi-window burn-rate alerts on objectives
- Ratio SLI validation (good/bad+total, rawType+query) + ratio observation parts
- Alert policies → `MetricRun.spec.alertsFired`
- Stage / environment overlays (`stages`, `--stage`, `resolveSuiteForStage`)
- Sampling policy (min n, required dimensions, coldStart)
- Waivers with expiry + statusOverride
- Evidence / suite privacy (redact, retention, classification)
- Interop: `importOpenSlo`, `importBudgetJson`, `importK6Thresholds` + `mtargets import`
- Drift + query-shape checks: `checkDrift`, `checkQueries` + CLI
- Distribution objectives (multi-percentile / histogram buckets)
- Docs: [docs/reference/advanced.md](docs/reference/advanced.md); example `advanced-reliability-ux.mtargets.yaml`

## 1.4.0

- Public **`validateFiles` / `expandMtargetsInputs`** API for outside projects and CI
- CLI: validate directories/globs, `--json`, `--strict`, `--no-resolve`, `--cwd`
- Docs: [docs/guide/validate.md](docs/guide/validate.md)

## 1.3.0

- 101 full catalog metric examples + generator/evaluate scripts
- Docs: [docs/guide/catalog.md](docs/guide/catalog.md)
- Suites may import catalogs with empty local `indicators`

## 1.2.0

- Subject types: `provider`, `hook`, `unit`
- Docs: [docs/guide/subjects.md](docs/guide/subjects.md)

## 1.1.0

- Integrations + example runners

## 1.0.0

- Initial mtargets v1 format + library + CLI
