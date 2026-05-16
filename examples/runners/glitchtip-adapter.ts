/**
 * GlitchTip → mtargets observations adapter (example).
 *
 * GlitchTip speaks a Sentry-compatible API. This runner mirrors sentry-adapter
 * but reads GLITCHTIP_URL + GLITCHTIP_TOKEN.
 *
 * Usage:
 *   npx tsx examples/runners/glitchtip-adapter.ts \
 *     --suite examples/suites/error-tracking.mtargets.yaml \
 *     --out examples/runs/error-tracking-glitchtip.mtargets.yaml
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stringify as stringifyYaml } from "yaml";
import {
  evaluateSuite,
  loadSuite,
  type Indicator,
  type IndicatorObservation,
  type MetricSuiteDoc,
} from "../../src/index.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

function arg(name: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

async function fetchGlitchtipMetric(
  ind: Indicator,
): Promise<{ observed: number; message: string }> {
  const live = process.env.GLITCHTIP_LIVE === "1";
  const metric = String(ind.source.params?.metric ?? "error_rate");

  if (!live) {
    return {
      observed: Number(process.env.DEMO_GLITCHTIP_ERROR_RATE ?? 0.003),
      message: `demo glitchtip ${metric}`,
    };
  }

  const baseUrlEnv = String(ind.source.params?.baseUrlEnv ?? "GLITCHTIP_URL");
  const baseUrl = process.env[baseUrlEnv] ?? process.env.GLITCHTIP_URL;
  const token = process.env.GLITCHTIP_TOKEN;
  const project = String(ind.source.params?.project ?? "");
  if (!baseUrl || !token || !project) {
    throw new Error(
      "GLITCHTIP_LIVE=1 requires GLITCHTIP_URL, GLITCHTIP_TOKEN, params.project",
    );
  }

  // Placeholder — point at your GlitchTip issues/stats route.
  const url = new URL(`/api/0/projects/${project}/issues/`, baseUrl.replace(/\/$/, "") + "/");
  const query = typeof ind.source.query === "string" ? ind.source.query : "";
  url.searchParams.set("query", query);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`GlitchTip API ${res.status}: ${await res.text()}`);
  }

  return {
    observed: Number(process.env.DEMO_GLITCHTIP_ERROR_RATE ?? 0.003),
    message: "live response received — map stats → observed in production adapter",
  };
}

async function collect(suite: MetricSuiteDoc): Promise<IndicatorObservation[]> {
  const out: IndicatorObservation[] = [];
  for (const ind of suite.spec.indicators) {
    if (ind.source.type !== "glitchtip") continue;
    const { observed, message } = await fetchGlitchtipMetric(ind);
    out.push({
      indicatorId: ind.id,
      observed,
      unit: ind.unit,
      message,
      samples: { n: 1 },
    });
  }
  return out;
}

async function main(): Promise<void> {
  const suitePath = path.resolve(
    root,
    arg("--suite", "examples/suites/error-tracking.mtargets.yaml")!,
  );
  const outPath = arg("--out", "examples/runs/error-tracking-glitchtip.mtargets.yaml");

  const { document: suite } = await loadSuite(suitePath);
  const glitchOnly: MetricSuiteDoc = {
    ...suite,
    spec: {
      ...suite.spec,
      indicators: suite.spec.indicators.filter((i) => i.source.type === "glitchtip"),
      objectives: suite.spec.objectives.filter((o) => {
        const ind = suite.spec.indicators.find((i) => i.id === o.indicator);
        return ind?.source.type === "glitchtip";
      }),
    },
  };

  const observations = await collect(glitchOnly);
  const run = evaluateSuite(glitchOnly, observations, {
    runId: "run-glitchtip-demo",
    labels: {
      runner: "glitchtip-adapter",
      mode: process.env.GLITCHTIP_LIVE === "1" ? "live" : "demo",
    },
  });

  const abs = path.resolve(root, outPath!);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, stringifyYaml(run), "utf8");
  console.log(`Wrote ${abs} (status=${run.spec.status})`);
  process.exit(run.spec.status === "pass" || run.spec.status === "warn" ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
