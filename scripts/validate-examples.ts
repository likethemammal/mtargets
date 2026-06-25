/**
 * Validate every mtargets document under examples/.
 * Used by `npm run validate:examples` and covered by tests.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDocumentFile, loadResolvedSuite } from "../src/load.js";
import { parseDocumentText } from "../src/parse.js";
import { isProductSpec, validateProductSpec } from "../src/product-schema.js";
import {
  formatValidationIssues,
  type ValidationIssue,
} from "../src/validate.js";

export interface ExampleValidationEntry {
  path: string;
  relativePath: string;
  kind?: string;
  ok: boolean;
  issues: ValidationIssue[];
}

export interface ValidateExamplesResult {
  ok: boolean;
  files: number;
  passed: number;
  failed: number;
  warnings: number;
  results: ExampleValidationEntry[];
}

/** Recursively find `*.mtargets.yaml|yml|json` under a directory. */
export async function walkMtargetsDocs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".git" || e.name === "dist") {
        continue;
      }
      out.push(...(await walkMtargetsDocs(full)));
    } else if (/\.mtargets\.(ya?ml|json)$/i.test(e.name)) {
      out.push(full);
    }
  }
  return out.sort();
}

/**
 * Validate all mtargets documents under `examplesDir`
 * (suites resolve catalog imports).
 */
export async function validateExamples(
  examplesDir: string,
  options: { cwd?: string } = {},
): Promise<ValidateExamplesResult> {
  const cwd = options.cwd ?? path.dirname(examplesDir);
  const files = await walkMtargetsDocs(examplesDir);
  if (files.length === 0) {
    throw new Error(`No mtargets documents found under ${examplesDir}`);
  }

  const results: ExampleValidationEntry[] = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    const raw = parseDocumentText(text);
    if (isProductSpec(raw)) {
      const validation = validateProductSpec(raw);
      results.push({
        path: file,
        relativePath: path.relative(cwd, file) || file,
        kind: "ProductSpec",
        ok: validation.ok,
        issues: validation.issues,
      });
      continue;
    }

    const loaded = await loadDocumentFile(file, { assert: false });
    const result =
      loaded.document.kind === "MetricSuite"
        ? await loadResolvedSuite(file, { assert: false })
        : loaded;
    results.push({
      path: file,
      relativePath: path.relative(cwd, file) || file,
      kind: result.document.kind,
      ok: result.validation.ok,
      issues: result.validation.issues,
    });
  }

  const failed = results.filter((r) => !r.ok).length;
  const warnings = results.reduce(
    (n, r) => n + r.issues.filter((i) => i.severity === "warning").length,
    0,
  );

  return {
    ok: failed === 0,
    files: results.length,
    passed: results.length - failed,
    failed,
    warnings,
    results,
  };
}

export function formatValidateExamplesResult(
  result: ValidateExamplesResult,
): string {
  const lines: string[] = [];
  for (const r of result.results) {
    const warns = r.issues.filter((i) => i.severity === "warning");
    if (r.ok) {
      lines.push(
        warns.length
          ? `OK  ${r.relativePath} (${warns.length} warnings)`
          : `OK  ${r.relativePath}`,
      );
      if (warns.length) lines.push(formatValidationIssues(warns));
    } else {
      lines.push(`FAIL ${r.relativePath}`);
      lines.push(formatValidationIssues(r.issues));
    }
  }
  lines.push(
    `\n${result.passed}/${result.files} passed` +
      (result.failed ? `, ${result.failed} failed` : "") +
      (result.warnings ? `, ${result.warnings} warning(s)` : ""),
  );
  return lines.join("\n");
}

function packageRoot(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
}

async function main(): Promise<void> {
  const root = packageRoot();
  const result = await validateExamples(path.join(root, "examples"), {
    cwd: root,
  });
  console.log(formatValidateExamplesResult(result));
  if (!result.ok) {
    console.error(`\n${result.failed} file(s) failed validation`);
    process.exit(1);
  }
  console.log(`\nValidated ${result.files} document(s)`);
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
