/**
 * Demo adapter for ux-granularity suite.
 * Mixes fixture observations for lighthouse/web-vitals/custom with live script collectors.
 *
 *   npm run demo:ux-granularity
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stringify as stringifyYaml } from "yaml";
import {
  evaluateSuite,
  loadSuite,
  type IndicatorObservation,
} from "../../src/index.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const runnersDir = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const suitePath = path.join(root, "examples/suites/ux-granularity.mtargets.yaml");
  const fixturePath = path.join(
    root,
    "examples/observations/ux-granularity-pass.json",
  );
  const { document: suite } = await loadSuite(suitePath);
  const base = JSON.parse(
    await readFile(fixturePath, "utf8"),
  ) as IndicatorObservation[];

  // Re-run script-backed indicators via collectors (overrides fixture values).
  const byId = new Map(base.map((o) => [o.indicatorId, o]));
  for (const ind of suite.spec.indicators) {
    if (ind.source.type !== "script") continue;
    const modRel = String(ind.source.params?.module ?? "");
    if (!modRel) continue;
    const modPath = path.resolve(runnersDir, modRel);
    const mod = (await import(pathToFileURL(modPath).href)) as {
      collect: (ctx: {
        indicatorId: string;
        query?: string | Record<string, unknown>;
        params?: Record<string, unknown>;
      }) => Promise<{ observed: number; unit?: string; message?: string }>;
    };
    const result = await mod.collect({
      indicatorId: ind.id,
      query: ind.source.query,
      params: ind.source.params,
    });
    byId.set(ind.id, {
      indicatorId: ind.id,
      observed: result.observed,
      unit: result.unit ?? ind.unit,
      message: result.message,
    });
  }

  const observations = [...byId.values()];
  const run = evaluateSuite(suite, observations, {
    runId: "run-ux-granularity-demo",
    labels: { runner: "ux-granularity-adapter" },
  });

  const out = path.join(root, "examples/runs/ux-granularity.mtargets.yaml");
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, stringifyYaml(run), "utf8");
  console.log(`Wrote ${out} (status=${run.spec.status})`);
  process.exit(run.spec.status === "pass" || run.spec.status === "warn" ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
