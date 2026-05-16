# Example runners & collectors

Adapters turn vendor/tool output into mtargets `IndicatorObservation[]`, then call `evaluateSuite`.

| Script | Suite | Notes |
|--------|-------|-------|
| [`lighthouse-adapter.ts`](./lighthouse-adapter.ts) | `suites/lighthouse-ci.mtargets.yaml` | Reads Lighthouse LHR JSON |
| [`sentry-adapter.ts`](./sentry-adapter.ts) | `suites/error-tracking.mtargets.yaml` | Demo by default; `SENTRY_LIVE=1` for API |
| [`glitchtip-adapter.ts`](./glitchtip-adapter.ts) | same | Demo by default; `GLITCHTIP_LIVE=1` |
| [`custom-adapter.ts`](./custom-adapter.ts) | `suites/custom-product.mtargets.yaml` | `custom` + `script` + `usage` |
| [`ux-granularity-adapter.ts`](./ux-granularity-adapter.ts) | `suites/ux-granularity.mtargets.yaml` | Page/component/hook + script collectors |

Collector modules used by `script` sources: [`../collectors/`](../collectors/).

```bash
npm run demo:lighthouse
npm run demo:sentry
npm run demo:glitchtip
npm run demo:custom
npm run demo:ux-granularity
```

See [docs/guide/integrations.md](../../docs/guide/integrations.md) and [docs/guide/subjects.md](../../docs/guide/subjects.md).
