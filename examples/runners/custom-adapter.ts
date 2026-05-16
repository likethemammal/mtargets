/**
 * Custom + script source adapter (example).
 *
 * - source.type: custom  → demo analytics values (or SQL in production)
 * - source.type: script  → dynamic import of params.module collector
 * - source.type: usage   → demo spend meter
 *
 * Usage:
 *   npx tsx examples/runners/custom-adapter.ts \
 *     --suite examples/suites/custom-product.mtargets.yaml \
 *     --out examples/runs/custom-product.mtargets.yaml
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stringify as stringifyYaml } from "yaml";
import {
  evaluateSuite,
  loadSuite,
  type Indicator,
  type IndicatorObservation,
  type MetricSuiteDoc,
} from "../../src/index.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const runnersDir = path.dirname(fileURLToPath(import.meta.url));

function arg(name: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

type Collector = (ctx: {
  indicatorId: string;
  query?: string | Record<string, unknown>;
  params?: Record<string, unknown>;
}) => Promise<{ observed: number; unit?: string; message?: string }>;

async function collectCustom(ind: Indicator): Promise<IndicatorObservation> {
  const q = String(ind.source.query ?? "");
  if (q === "dx.brief_time_to_green") {
    return {
      indicatorId: ind.id,
      observed: Number(process.env.DEMO_TTG_SECONDS ?? 720),
      unit: ind.unit,
      message: "demo custom analytics",
      samples: { n: 200 },
    };
  }
  if (q === "dx.template_adoption") {
    return {
      indicatorId: ind.id,
      observed: Number(process.env.DEMO_TEMPLATE_ADOPTION ?? 0.55),
      unit: ind.unit,
      message: "demo custom analytics",
    };
  }
  throw new Error(`Unknown custom query: ${q}`);
}

async function collectScript(ind: Indicator): Promise<IndicatorObservation> {
  const modRel = String(ind.source.params?.module ?? "");
  if (!modRel) throw new Error(`script indicator ${ind.id} missing params.module`);

  // Resolve relative to the suite file's typical examples/ layout
  const modPath = path.resolve(runnersDir, modRel);
  const imported = (await import(pathToFileURL(modPath).href)) as {
    collect: Collector;
  };
  if (typeof imported.collect !== "function") {
    throw new Error(`${modPath} must export async function collect()`);
  }
  const result = await imported.collect({
    indicatorId: ind.id,
    query: ind.source.query,
    params: ind.source.params,
  });
  return {
    indicatorId: ind.id,
    observed: result.observed,
    unit: result.unit ?? ind.unit,
    message: result.message,
  };
}

async function collectUsage(ind: Indicator): Promise<IndicatorObservation> {
  return {
    indicatorId: ind.id,
    observed: Number(process.env.DEMO_MONTHLY_SPEND ?? 88.5),
    unit: ind.unit,
    message: "demo usage meter",
  };
}

async function collectAll(suite: MetricSuiteDoc): Promise<IndicatorObservation[]> {
  const out: IndicatorObservation[] = [];
  for (const ind of suite.spec.indicators) {
    switch (ind.source.type) {
      case "custom":
        out.push(await collectCustom(ind));
        break;
      case "script":
        out.push(await collectScript(ind));
        break;
      case "usage":
        out.push(await collectUsage(ind));
        break;
      default:
        break;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const suitePath = path.resolve(
    root,
    arg("--suite", "examples/suites/custom-product.mtargets.yaml")!,
  );
  const outPath = arg("--out", "examples/runs/custom-product.mtargets.yaml");

  const { document: suite } = await loadSuite(suitePath);
  const observations = await collectAll(suite);
  const run = evaluateSuite(suite, observations, {
    runId: "run-custom-product-demo",
    labels: { runner: "custom-adapter" },
  });

  const abs = path.resolve(root, outPath!);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, stringifyYaml(run), "utf8");
  console.log(`Wrote ${abs} (status=${run.spec.status})`);
  console.log(
    `Observations: ${observations.map((o) => `${o.indicatorId}=${o.observed}`).join(", ")}`,
  );
  process.exit(run.spec.status === "pass" || run.spec.status === "warn" ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
