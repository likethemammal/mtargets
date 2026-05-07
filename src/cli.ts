#!/usr/bin/env node
/**
 * mtargets CLI - install via `npm i -D mtargets` then run `npx mtargets validate ...`
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { checkDrift, checkQueries, suiteToAlertSnapshot } from "./drift.js";
import { evaluateSuite } from "./evaluate.js";
import {
  formatLighthousercFile,
  generateLighthousercConfig,
  inferLighthousercFormat,
} from "./generate-lighthouserc.js";
import { suiteToGherkin } from "./gherkin.js";
import {
  importBudgetJson,
  importK6Thresholds,
  importOpenSlo,
} from "./interop.js";
import { loadResolvedSuite, loadSuite } from "./load.js";
import { loadProductSpecFile } from "./load-product.js";
import { parseDocumentText } from "./parse.js";
import { formatAgentMarkdown } from "./product-report.js";
import { loadProductDataFile } from "./product-data.js";
import {
  assertValidProductSpec,
  isProductSpec,
} from "./product-schema.js";
import {
  applyProductBaselines,
  productValidateExitCode,
  validateProductActuals,
} from "./product-validate.js";
import type { IndicatorObservation } from "./types.js";
import {
  formatValidateFilesResult,
  validateFiles,
} from "./validate-files.js";

async function writeOut(filePath: string, contents: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
}

function usage(): never {
  console.log(`mtargets — Metric Targets CLI

Validate mtargets documents (suites, catalogs, runs, bindings):
  mtargets validate <file|dir|glob> [...] [options]

Validate product schema actuals against tiers (v0.2):
  mtargets validate --spec <product.mtargets.json> --data <actuals.json> [options]
    --suite <id>      Filter to one suite
    --route <path>    Filter to one route
    --output <file>   Write JSON report (default: stdout)
    Exit codes: 0=pass, 1=warn, 2=fail

Capture current actuals as baselines on a product spec:
  mtargets baseline --spec <product.mtargets.json> --data <actuals.json> [options]
    --suite <id> / --route <path>   Filters
    --output <file>                 Write updated spec (default: overwrite --spec)

Evaluate a suite against observations:
  mtargets evaluate <suite.mtargets.yaml> --observations <obs.json> [--stage <id>] [--out <run.mtargets.yaml>]

Project a suite to Gherkin (readability aid):
  mtargets gherkin <suite.mtargets.yaml> [--out <file.feature>]

Query-shape dry-run (no live backends):
  mtargets check-queries <suite.mtargets.yaml> [--json]

Drift vs live alert snapshot:
  mtargets drift <suite.mtargets.yaml> --live <snapshot.json> [--json]

Import foreign formats:
  mtargets import openslo <file.yaml> [--out <suite.mtargets.yaml>]
  mtargets import budget <budget.json> [--out <suite.mtargets.yaml>]
  mtargets import k6 <thresholds.json> [--out <suite.mtargets.yaml>]

Generate Lighthouse CI assertions from a product spec:
  mtargets generate lighthouserc --spec <product.mtargets.json> --out <lighthouserc.gen.cjs>

Agent-readable product report (runs validate against --data):
  mtargets report --spec <product.mtargets.json> --data <actuals.json> --format agent-markdown
  mtargets report --spec <product.mtargets.json> --data <actuals.json> --format json [--out report.json]

Report options:
  --suite <id>        Filter metrics by suite key
  --route <path>      Filter to one route

Document validate options:
  --json              Print machine-readable JSON result
  --strict            Fail when warnings are present
  --no-resolve        Do not resolve suite catalog imports
  --cwd <dir>         Base directory for relative paths (default: cwd)

Examples:
  npx mtargets validate ./metrics --strict
  npx mtargets validate --spec comfy-art.mtargets.json --data rum.json --output report.json
  npx mtargets baseline --spec comfy-art.mtargets.json --data rum.json
  npx mtargets generate lighthouserc --spec examples/product/v0.2-minimal.mtargets.json --out lighthouserc.gen.cjs
  npx mtargets report --spec examples/product/v0.2-minimal.mtargets.json --data actuals.json --format agent-markdown
  npx mtargets evaluate suite.mtargets.yaml --observations obs.json --stage prod
  npx mtargets check-queries suite.mtargets.yaml
  npx mtargets drift suite.mtargets.yaml --live live-alerts.json
`);
  process.exit(1);
}

function takeFlag(argv: string[], name: string): boolean {
  const i = argv.indexOf(name);
  if (i < 0) return false;
  argv.splice(i, 1);
  return true;
}

function takeOpt(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function loadRawProductSpec(specPath: string): Promise<unknown> {
  const text = await readFile(specPath, "utf8");
  return parseDocumentText(text);
}

async function cmdProductValidate(argv: string[]): Promise<number> {
  const specPath = takeOpt(argv, "--spec");
  const dataPath = takeOpt(argv, "--data");
  const db = takeOpt(argv, "--db");
  const query = takeOpt(argv, "--query");
  const suite = takeOpt(argv, "--suite");
  const route = takeOpt(argv, "--route");
  const output = takeOpt(argv, "--output") ?? takeOpt(argv, "--out");

  if (!specPath) usage();
  if (db || query) {
    console.error(
      "Live --db/--query is not bundled; export pino-postgres (or other) results to JSON and pass --data <file>.",
    );
    return 2;
  }
  if (!dataPath) {
    console.error("Product validate requires --data <actuals.json>");
    return 2;
  }

  try {
    const raw = await loadRawProductSpec(path.resolve(specPath));
    if (!isProductSpec(raw)) {
      console.error(
        `--spec must be a product schema document (name + metrics/targets)`,
      );
      return 2;
    }
    const spec = assertValidProductSpec(raw);
    const data = await loadProductDataFile(path.resolve(dataPath));
    const report = validateProductActuals(spec, data.actuals, {
      suite,
      route,
      dataSource: data.dataSource,
    });
    const json = JSON.stringify(report, null, 2) + "\n";
    if (output) {
      await writeOut(path.resolve(output), json);
      console.error(`Wrote ${output}`);
    } else {
      process.stdout.write(json);
    }
    return productValidateExitCode(report.summary);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return 2;
  }
}

async function cmdBaseline(argv: string[]): Promise<number> {
  const specPath = takeOpt(argv, "--spec");
  const dataPath = takeOpt(argv, "--data");
  const db = takeOpt(argv, "--db");
  const suite = takeOpt(argv, "--suite");
  const route = takeOpt(argv, "--route");
  const output =
    takeOpt(argv, "--output") ?? takeOpt(argv, "--out") ?? specPath;

  if (!specPath) usage();
  if (db) {
    console.error(
      "Live --db is not bundled; export actuals to JSON and pass --data <file>.",
    );
    return 1;
  }
  if (!dataPath) {
    console.error("baseline requires --data <actuals.json>");
    return 1;
  }

  try {
    const resolvedSpec = path.resolve(specPath);
    const raw = await loadRawProductSpec(resolvedSpec);
    if (!isProductSpec(raw) || !isRecord(raw)) {
      console.error(
        `--spec must be a product schema document (name + metrics/targets)`,
      );
      return 1;
    }
    const spec = assertValidProductSpec(raw);
    const data = await loadProductDataFile(path.resolve(dataPath));
    const { document, updated } = applyProductBaselines(
      raw,
      spec,
      data.actuals,
      { suite, route },
    );
    const outPath = path.resolve(output!);
    const text =
      outPath.endsWith(".yaml") || outPath.endsWith(".yml")
        ? stringifyYaml(document)
        : JSON.stringify(document, null, 2) + "\n";
    await writeOut(outPath, text);
    console.log(`Updated ${updated.length} baseline(s) → ${outPath}`);
    for (const u of updated) {
      const loc = u.route ? `${u.key}[${u.route}]` : u.key;
      console.log(`  ${loc} = ${u.baseline}`);
    }
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return 1;
  }
}

async function cmdValidate(argv: string[]): Promise<number> {
  if (argv.includes("--spec")) {
    return cmdProductValidate(argv);
  }

  const json = takeFlag(argv, "--json");
  const strict = takeFlag(argv, "--strict");
  const noResolve = takeFlag(argv, "--no-resolve");
  const cwd = takeOpt(argv, "--cwd") ?? process.cwd();
  const inputs = argv;
  if (inputs.length === 0) usage();

  try {
    const result = await validateFiles(inputs, {
      cwd,
      strict,
      resolveImports: !noResolve,
    });
    if (json) {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    } else {
      console.log(formatValidateFilesResult(result));
    }
    return result.ok ? 0 : 1;
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return 1;
  }
}

async function cmdEvaluate(
  suitePath: string,
  obsPath: string,
  outPath?: string,
  stage?: string,
): Promise<number> {
  const { document: resolved } = await loadResolvedSuite(suitePath);
  const obsText = await readFile(obsPath, "utf8");
  const observations = JSON.parse(obsText) as IndicatorObservation[];
  const run = evaluateSuite(resolved, observations, { stage });
  const yaml = stringifyYaml(run);
  if (outPath) {
    await writeOut(outPath, yaml);
    console.log(`Wrote ${outPath} (status=${run.spec.status})`);
  } else {
    process.stdout.write(yaml);
  }
  return run.spec.status === "pass" || run.spec.status === "warn" ? 0 : 1;
}

async function cmdGherkin(suitePath: string, outPath?: string): Promise<number> {
  const { document } = await loadSuite(suitePath);
  const feature = suiteToGherkin(document);
  if (outPath) {
    await writeOut(outPath, feature);
    console.log(`Wrote ${outPath}`);
  } else {
    process.stdout.write(feature);
  }
  return 0;
}

async function cmdCheckQueries(argv: string[]): Promise<number> {
  const json = takeFlag(argv, "--json");
  const suitePath = argv[0];
  if (!suitePath) usage();
  const { document } = await loadResolvedSuite(suitePath);
  const result = checkQueries(document);
  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    for (const i of result.issues) {
      console.log(`${i.severity.toUpperCase()} ${i.path}: ${i.message}`);
    }
    console.log(result.ok ? "OK" : "FAIL");
  }
  return result.ok ? 0 : 1;
}

async function cmdDrift(argv: string[]): Promise<number> {
  const json = takeFlag(argv, "--json");
  const livePath = takeOpt(argv, "--live");
  const suitePath = argv[0];
  if (!suitePath || !livePath) usage();
  const { document } = await loadResolvedSuite(suitePath);
  const liveText = await readFile(livePath, "utf8");
  const live = JSON.parse(liveText) as ReturnType<typeof suiteToAlertSnapshot>;
  const result = checkDrift(document, live);
  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    for (const i of result.issues) {
      console.log(`${i.severity.toUpperCase()} ${i.path}: ${i.message}`);
    }
    console.log(result.ok ? "OK" : "FAIL");
  }
  return result.ok ? 0 : 1;
}

async function cmdImport(argv: string[]): Promise<number> {
  const outPath = takeOpt(argv, "--out");
  const kind = argv[0];
  const filePath = argv[1];
  if (!kind || !filePath) usage();

  const text = await readFile(path.resolve(filePath), "utf8");
  let suite;
  if (kind === "openslo") {
    suite = importOpenSlo(parseYaml(text) as never);
  } else if (kind === "budget") {
    suite = importBudgetJson(JSON.parse(text) as never);
  } else if (kind === "k6") {
    suite = importK6Thresholds(JSON.parse(text) as never);
  } else {
    usage();
  }

  const yaml = stringifyYaml(suite);
  if (outPath) {
    await writeOut(path.resolve(outPath), yaml);
    console.log(`Wrote ${outPath}`);
  } else {
    process.stdout.write(yaml);
  }
  return 0;
}


async function cmdGenerate(argv: string[]): Promise<number> {
  const target = argv[0];
  if (target !== "lighthouserc") usage();
  const rest = argv.slice(1);
  const specPath = takeOpt(rest, "--spec");
  const outPath = takeOpt(rest, "--out");
  if (!specPath || !outPath) usage();

  try {
    const spec = await loadProductSpecFile(path.resolve(specPath));
    const config = generateLighthousercConfig(spec);
    const format = inferLighthousercFormat(outPath);
    const contents = formatLighthousercFile(config, format);
    await writeOut(path.resolve(outPath), contents);
    const n = Object.keys(config.ci.assert.assertions).length;
    console.log(`Wrote ${outPath} (${n} assertion${n === 1 ? "" : "s"})`);
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return 1;
  }
}

async function cmdReport(argv: string[]): Promise<number> {
  const specPath = takeOpt(argv, "--spec");
  const dataPath = takeOpt(argv, "--data");
  const format = takeOpt(argv, "--format") ?? "agent-markdown";
  const outPath = takeOpt(argv, "--out") ?? takeOpt(argv, "--output");
  const suite = takeOpt(argv, "--suite");
  const route = takeOpt(argv, "--route");
  if (!specPath || !dataPath) usage();
  if (format !== "agent-markdown" && format !== "json") {
    console.error(
      `Unsupported --format ${format} (use agent-markdown or json)`,
    );
    return 1;
  }

  try {
    const raw = await loadRawProductSpec(path.resolve(specPath));
    if (!isProductSpec(raw)) {
      console.error(
        `--spec must be a product schema document (name + metrics/targets)`,
      );
      return 1;
    }
    const spec = assertValidProductSpec(raw);
    const data = await loadProductDataFile(path.resolve(dataPath));
    const report = validateProductActuals(spec, data.actuals, {
      suite,
      route,
      dataSource: data.dataSource,
    });
    const body =
      format === "json"
        ? `${JSON.stringify(report, null, 2)}\n`
        : formatAgentMarkdown(report);
    if (outPath) {
      await writeOut(path.resolve(outPath), body);
      console.log(`Wrote ${outPath}`);
    } else {
      process.stdout.write(body.endsWith("\n") ? body : `${body}\n`);
    }
    return productValidateExitCode(report.summary);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return 1;
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") usage();

  let code = 0;
  if (cmd === "validate") {
    code = await cmdValidate(argv.slice(1));
  } else if (cmd === "baseline") {
    code = await cmdBaseline(argv.slice(1));
  } else if (cmd === "evaluate") {
    const rest = argv.slice(1);
    const stage = takeOpt(rest, "--stage");
    const suitePath = rest[0];
    const obsIdx = rest.indexOf("--observations");
    const outIdx = rest.indexOf("--out");
    if (!suitePath || obsIdx < 0 || !rest[obsIdx + 1]) usage();
    code = await cmdEvaluate(
      path.resolve(suitePath),
      path.resolve(rest[obsIdx + 1]!),
      outIdx >= 0 && rest[outIdx + 1]
        ? path.resolve(rest[outIdx + 1]!)
        : undefined,
      stage,
    );
  } else if (cmd === "gherkin") {
    const rest = argv.slice(1);
    const suitePath = rest[0];
    const outIdx = rest.indexOf("--out");
    if (!suitePath) usage();
    code = await cmdGherkin(
      path.resolve(suitePath),
      outIdx >= 0 && rest[outIdx + 1]
        ? path.resolve(rest[outIdx + 1]!)
        : undefined,
    );
  } else if (cmd === "check-queries") {
    code = await cmdCheckQueries(argv.slice(1));
  } else if (cmd === "drift") {
    code = await cmdDrift(argv.slice(1));
  } else if (cmd === "import") {
    code = await cmdImport(argv.slice(1));
  } else if (cmd === "generate") {
    code = await cmdGenerate(argv.slice(1));
  } else if (cmd === "report") {
    code = await cmdReport(argv.slice(1));
  } else {
    usage();
  }
  process.exit(code);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
