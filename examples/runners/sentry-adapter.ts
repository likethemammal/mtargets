/**
 * Sentry → mtargets observations adapter (example).
 *
 * Demo mode (default): uses fixtures / env overrides — no network.
 * Live mode: set SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_LIVE=1
 *
 * Usage:
 *   npx tsx examples/runners/sentry-adapter.ts \
 *     --suite examples/suites/error-tracking.mtargets.yaml \
 *     --out examples/runs/error-tracking-sentry.mtargets.yaml
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

async function fetchSentryMetric(
  ind: Indicator,
): Promise<{ observed: number; message: string }> {
  const live = process.env.SENTRY_LIVE === "1";
  const metric = String(ind.source.params?.metric ?? "error_rate");

  if (!live) {
    // Demo values — replace with API calls when SENTRY_LIVE=1
    if (metric === "issue_count") {
      return {
        observed: Number(process.env.DEMO_SENTRY_ISSUES ?? 12),
        message: "demo issue_count",
      };
    }
    return {
      observed: Number(process.env.DEMO_SENTRY_ERROR_RATE ?? 0.004),
      message: "demo error_rate",
    };
  }

  const token = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = String(ind.source.params?.project ?? "");
  if (!token || !org || !project) {
    throw new Error("SENTRY_LIVE=1 requires SENTRY_AUTH_TOKEN, SENTRY_ORG, params.project");
  }

  // Illustrative Issues API call — adjust to your Sentry version / stats endpoint.
  const query = typeof ind.source.query === "string" ? ind.source.query : "";
  const url = new URL(
    `https://sentry.io/api/0/projects/${org}/${project}/issues/`,
  );
  url.searchParams.set("query", query);
  url.searchParams.set("limit", "1");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Sentry API ${res.status}: ${await res.text()}`);
  }

  // Real adapters should use stats endpoints for rates; this demo returns a count proxy.
  const payload = (await res.json()) as unknown[];
  if (metric === "issue_count") {
    return { observed: payload.length, message: "live issue search length (demo mapping)" };
  }
  return {
    observed: Number(process.env.DEMO_SENTRY_ERROR_RATE ?? 0.004),
    message: "live mode still needs a stats mapping for error_rate — set DEMO override",
  };
}

async function collect(
  suite: MetricSuiteDoc,
): Promise<IndicatorObservation[]> {
  const out: IndicatorObservation[] = [];
  for (const ind of suite.spec.indicators) {
    if (ind.source.type !== "sentry") continue;
    const { observed, message } = await fetchSentryMetric(ind);
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
  const outPath = arg("--out", "examples/runs/error-tracking-sentry.mtargets.yaml");

  const { document: suite } = await loadSuite(suitePath);

  // Only evaluate sentry-backed objectives in this runner: drop glitchtip indicators
  // by providing skip-friendly observations for them via missing treat — simpler:
  // filter suite copy for demo clarity.
  const sentryOnly: MetricSuiteDoc = {
    ...suite,
    spec: {
      ...suite.spec,
      indicators: suite.spec.indicators.filter((i) => i.source.type === "sentry"),
      objectives: suite.spec.objectives.filter((o) => {
        const ind = suite.spec.indicators.find((i) => i.id === o.indicator);
        return ind?.source.type === "sentry";
      }),
      evidence: suite.spec.evidence,
    },
  };

  const observations = await collect(sentryOnly);
  const run = evaluateSuite(sentryOnly, observations, {
    runId: "run-sentry-demo",
    labels: { runner: "sentry-adapter", mode: process.env.SENTRY_LIVE === "1" ? "live" : "demo" },
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
