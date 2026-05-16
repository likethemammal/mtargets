/**
 * Lighthouse / LHR → mtargets observations adapter (example).
 *
 * Usage:
 *   npx tsx examples/runners/lighthouse-adapter.ts \
 *     --suite examples/suites/lighthouse-ci.mtargets.yaml \
 *     --lhr examples/fixtures/lhr-sample.json \
 *     --out examples/runs/lighthouse-ci.mtargets.yaml
 *
 * In CI: point --lhr at the JSON from `lighthouse` or LHCI.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stringify as stringifyYaml } from "yaml";
import {
  evaluateSuite,
  loadSuite,
  type IndicatorObservation,
  type MetricSuiteDoc,
} from "../../src/index.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

function arg(name: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

type Lhr = {
  categories?: Record<string, { score?: number | null }>;
  audits?: Record<
    string,
    {
      numericValue?: number;
      details?: { items?: Array<{ resourceType?: string; transferSize?: number }> };
    }
  >;
};

function readAuditMs(lhr: Lhr, auditId: string): number | null {
  const v = lhr.audits?.[auditId]?.numericValue;
  return typeof v === "number" ? v : null;
}

function readCategoryScore(lhr: Lhr, key: string): number | null {
  // query form: categories:performance
  const id = key.replace(/^categories:/, "");
  const s = lhr.categories?.[id]?.score;
  return typeof s === "number" ? s : null;
}

function readScriptKiB(lhr: Lhr): number | null {
  const items = lhr.audits?.["resource-summary"]?.details?.items ?? [];
  const script = items.find((i) => i.resourceType === "script");
  if (typeof script?.transferSize !== "number") return null;
  return script.transferSize / 1024;
}

function collectFromLhr(
  suite: MetricSuiteDoc,
  lhr: Lhr,
  lhrPath: string,
): IndicatorObservation[] {
  const out: IndicatorObservation[] = [];

  for (const ind of suite.spec.indicators) {
    if (ind.source.type !== "lighthouse" && ind.source.type !== "resource-budget") {
      continue;
    }
    const query = typeof ind.source.query === "string" ? ind.source.query : "";
    let observed: number | null = null;

    if (ind.source.type === "lighthouse") {
      if (query.startsWith("categories:")) {
        observed = readCategoryScore(lhr, query);
      } else {
        observed = readAuditMs(lhr, query);
      }
    } else if (query === "script.transferSize") {
      observed = readScriptKiB(lhr);
    }

    out.push({
      indicatorId: ind.id,
      observed,
      unit: ind.unit,
      samples: { n: 1 },
      evidence: [
        {
          evidenceId: "lhr",
          uri: `file://${path.resolve(lhrPath)}`,
          contentType: "application/json",
        },
      ],
    });
  }

  return out;
}

async function main(): Promise<void> {
  const suitePath = path.resolve(
    root,
    arg("--suite", "examples/suites/lighthouse-ci.mtargets.yaml")!,
  );
  const lhrPath = path.resolve(
    root,
    arg("--lhr", "examples/fixtures/lhr-sample.json")!,
  );
  const outPath = arg("--out");

  const { document: suite } = await loadSuite(suitePath);
  const lhr = JSON.parse(await readFile(lhrPath, "utf8")) as Lhr;
  const observations = collectFromLhr(suite, lhr, lhrPath);
  const run = evaluateSuite(suite, observations, {
    runId: "run-lighthouse-ci-demo",
    labels: { runner: "lighthouse-adapter" },
  });

  const yaml = stringifyYaml(run);
  if (outPath) {
    const abs = path.resolve(root, outPath);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, yaml, "utf8");
    console.log(`Wrote ${abs} (status=${run.spec.status})`);
  } else {
    process.stdout.write(yaml);
  }

  process.exit(run.spec.status === "pass" || run.spec.status === "warn" ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
