/**
 * Pino-postgres → mtargets observations adapter (comfy-art dashboard example).
 *
 * Comfy Art stores web-vitals SDK events (LCP, INP, CLS, TTFB, FCP) and
 * custom UX events (rage-click, jank, long-task, rating-action, queue-fetch,
 * generation-ttfr, queue-wait, generation-failure, generation-complete) via
 * pino-postgres into a `dashboard_logs` table.
 *
 * Schema (relevant columns):
 *   dashboard_logs(id, ts, event_type, name, value, path, session_id, ...)
 *
 * Usage:
 *   COMFY_ART_DB_URL=postgres://... npx tsx examples/runners/pino-postgres-adapter.ts \
 *     --suite examples/suites/comfy-art-dashboard.mtargets.yaml \
 *     --out examples/runs/comfy-art-dashboard.mtargets.yaml
 *
 * Demo mode (default when COMFY_ART_DB_URL is unset): returns fixture values
 * that match passing thresholds so you can validate the suite locally.
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

// Demo fixture values — replace with real DB results in production.
const DEMO_VALUES: Record<string, number> = {
  lcp: 1800,
  lcp_rating: 1600,
  lcp_curation_styles: 3200,
  inp: 120,
  cls: 0.05,
  ttfb: 400,
  fcp: 1400,
  rating_action_latency: 150,
  queue_fetch_time: 600,
  long_task_rate: 0.03,
  jank_rate: 1.5,
  rage_click_rate: 0.01,
  ttfr: 3500,
  queue_wait_time: 15000,
  generation_failure_rate: 0.02,
};

async function queryPostgres(sql: string): Promise<number> {
  // Only import 'pg' when a live DB URL is set — avoids a hard devDependency.
  const { default: pg } = (await import("pg")) as {
    default: {
      Client: new (opts: { connectionString: string }) => {
        connect(): Promise<void>;
        query(sql: string): Promise<{ rows: Array<Record<string, unknown>> }>;
        end(): Promise<void>;
      };
    };
  };
  const dbUrl = process.env.COMFY_ART_DB_URL!;
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const result = await client.query(sql);
    const row = result.rows[0];
    const value = row ? Object.values(row)[0] : null;
    return value == null ? NaN : Number(value);
  } finally {
    await client.end();
  }
}

async function collectPinoPostgres(ind: Indicator): Promise<IndicatorObservation> {
  const metric = String(ind.source.params?.metric ?? ind.id);
  const live = Boolean(process.env.COMFY_ART_DB_URL);

  let observed: number;
  let message: string;

  if (live) {
    const sql = typeof ind.source.query === "string" ? ind.source.query : "";
    if (!sql) {
      throw new Error(`pino-postgres indicator ${ind.id} missing source.query`);
    }
    observed = await queryPostgres(sql);
    message = `live pino-postgres ${metric}`;
  } else {
    // Demo: return fixture value for the metric key
    const fixtureKey = metric.replace(/-/g, "_");
    observed = DEMO_VALUES[fixtureKey] ?? 0;
    message = `demo pino-postgres ${metric} (set COMFY_ART_DB_URL for live)`;
  }

  return {
    indicatorId: ind.id,
    observed,
    unit: ind.unit,
    message,
    samples: { n: live ? 1 : 200 },
  };
}

async function collect(suite: MetricSuiteDoc): Promise<IndicatorObservation[]> {
  const pinoIndicators = suite.spec.indicators.filter(
    (i) => i.source.type === "pino-postgres",
  );
  return Promise.all(pinoIndicators.map(collectPinoPostgres));
}

async function main(): Promise<void> {
  const suitePath = path.resolve(
    root,
    arg("--suite", "examples/suites/comfy-art-dashboard.mtargets.yaml")!,
  );
  const outPath =
    arg("--out") ?? "examples/runs/comfy-art-dashboard.mtargets.yaml";
  const live = Boolean(process.env.COMFY_ART_DB_URL);

  const { document: suite } = await loadSuite(suitePath);

  // Filter to pino-postgres indicators only — other runners (lighthouse, glitchtip)
  // run separately. Combine outputs before evaluateSuite for a full gate.
  const pinoSuite: MetricSuiteDoc = {
    ...suite,
    spec: {
      ...suite.spec,
      indicators: suite.spec.indicators.filter((i) => i.source.type === "pino-postgres"),
      objectives: suite.spec.objectives.filter((o) => {
        const ind = suite.spec.indicators.find((i) => i.id === o.indicator);
        return ind?.source.type === "pino-postgres";
      }),
      composites: [],
    },
  };

  const observations = await collect(pinoSuite);
  const run = evaluateSuite(pinoSuite, observations, {
    runId: `run-pino-postgres-${Date.now()}`,
    labels: {
      runner: "pino-postgres-adapter",
      mode: live ? "live" : "demo",
    },
  });

  const abs = path.resolve(root, outPath);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, stringifyYaml(run), "utf8");
  console.log(`Wrote ${abs} (status=${run.spec.status})`);
  process.exit(run.spec.status === "pass" || run.spec.status === "warn" ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
