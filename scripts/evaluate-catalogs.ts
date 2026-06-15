/**
 * Evaluate all generated catalog-* suites against their pass observations.
 */
import { readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stringify as stringifyYaml } from "yaml";
import { evaluateSuite } from "../src/evaluate.js";
import { loadResolvedSuite } from "../src/load.js";
import type { IndicatorObservation } from "../src/types.js";
import { readFile } from "node:fs/promises";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main(): Promise<void> {
  const suitesDir = path.join(root, "examples/suites");
  const files = (await readdir(suitesDir))
    .filter((f) => f.startsWith("catalog-") && f.endsWith(".mtargets.yaml"))
    .sort();

  let failed = 0;
  for (const file of files) {
    const id = file.replace(/\.mtargets\.ya?ml$/i, "");
    const suitePath = path.join(suitesDir, file);
    const obsPath = path.join(
      root,
      "examples/observations",
      `${id}-pass.json`,
    );
    const { document: suite } = await loadResolvedSuite(suitePath);
    const obs = JSON.parse(
      await readFile(obsPath, "utf8"),
    ) as IndicatorObservation[];
    const run = evaluateSuite(suite, obs, {
      runId: `run-${id}`,
      labels: { runner: "evaluate-catalogs" },
    });
    const out = path.join(root, "examples/runs", `${id}.mtargets.yaml`);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, stringifyYaml(run), "utf8");
    const ok = run.spec.status === "pass" || run.spec.status === "warn";
    console.log(
      `${ok ? "OK" : "FAIL"} ${id} status=${run.spec.status} objectives=${suite.spec.objectives.length}`,
    );
    if (!ok) failed++;
  }
  if (failed) process.exit(1);
  console.log(`\nEvaluated ${files.length} catalog suite(s)`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
