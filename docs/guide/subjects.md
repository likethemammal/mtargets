# Subjects: pages, components, units, providers, hooks, API, networks

How to scope mtargets beyond a single page Lighthouse run.

## Subject types

| `type` | Use for | Typical `selectors` |
|--------|---------|---------------------|
| `surface` | Page / route / screen | `path`, `url`, `viewport`, `network` |
| `component` | UI widget / Storybook story | `component`, `story`, `selector`, `testid` |
| `unit` | Isolated unit under test (pure fn, small module) | `module`, `export`, `testFile` |
| `provider` | Context / DI / theme / auth provider | `provider`, `wrapper`, `story` |
| `hook` | React/Vue composable hook | `hook`, `renderHook`, `fixture` |
| `service` | HTTP/API backend | `service`, `route`, `method` |
| `dataset` | API payload / fixture shape | `schema`, `fixture`, `endpoint` |
| `flow` | Multi-step journey | `steps`, `entry`, `exit` |
| `system` | Whole product / platform | `environment` |
| `agent` | Agent / bot under eval | `agent`, `suite` |

Runners interpret `selectors`; mtargets only stores them.

## Networking conditions

Encode network as **selectors on the subject** (or duplicate subjects per condition):

```yaml
subjects:
  - id: checkout-4g
    type: surface
    selectors: { path: /checkout, network: 4g, viewport: mobile }
  - id: checkout-slow-3g
    type: surface
    selectors: { path: /checkout, network: slow-3g, viewport: mobile, cpuThrottling: 4 }
  - id: checkout-offline
    type: surface
    selectors: { path: /checkout, network: offline }
```

Recommended `selectors.network` vocabulary (open string):

`offline` · `slow-2g` · `2g` · `3g` · `slow-3g` · `4g` · `lte` · `wifi` · `cable` · `custom`

Optional companions: `latencyMs`, `downloadKbps`, `uploadKbps`, `cpuThrottling`, `packetLossPercent`.

## Jank, animation, memory

| Concern | Indicator pattern | Sources |
|---------|-------------------|---------|
| Main-thread jank (lab) | `timing` ms — TBT / long tasks | `lighthouse` `total-blocking-time` |
| Interaction jank (field) | `timing` ms — INP | `web-vitals` `inp` |
| Animation smoothness | `gauge` fps | `script` rAF sampler |
| Layout instability | CLS | `lighthouse` / `web-vitals` |
| Memory | `gauge` MiB or DOM `count` | `script` / `custom` heap / node count |

See suites:

- [`examples/suites/ux-granularity.mtargets.yaml`](../../examples/suites/ux-granularity.mtargets.yaml) — page, component, unit, provider, hook, jank/animation/memory
- [`examples/suites/network-conditions.mtargets.yaml`](../../examples/suites/network-conditions.mtargets.yaml) — same page under 4G / slow-3G / offline
- [`examples/suites/api-data.mtargets.yaml`](../../examples/suites/api-data.mtargets.yaml) — API latency, payload size, schema freshness

## Composition tips

1. **One subject per measurable thing** — don’t overload a page subject with component-only probes.
2. **Reuse indicators via catalog** when the same LCP/INP definition applies to many surfaces.
3. **Network variants** = separate subjects (clear CI matrix) or one subject + runner matrix param (`matrix-condition` style in bindings).
4. **Providers/hooks** usually measured in unit/harness time (render duration, re-render count), not full-page LCP.
5. **API data** subjects pair `service` (latency/errors) with `dataset` (bytes, row count, schema age).
