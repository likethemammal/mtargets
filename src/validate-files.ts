/**
 * File/directory validation API for external projects and CI.
 */
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { loadDocumentFile, loadResolvedSuite } from "./load.js";
import { parseDocumentText } from "./parse.js";
import { isProductSpec, validateProductSpec } from "./product-schema.js";
import {
  formatValidationIssues,
  type ValidationIssue,
  type ValidationResult,
} from "./validate.js";

/** @category Validation */
export interface ValidateFilesOptions {
  /** Resolve MetricSuite catalog imports before validating (default true). */
  resolveImports?: boolean;
  /** Treat warnings as failures (default false). */
  strict?: boolean;
  /** Base directory for relative paths (default process.cwd()). */
  cwd?: string;
  /**
   * File name filter when walking directories.
   * Default: /\.mtargets\.(ya?ml|json)$/i
   */
  filePattern?: RegExp;
}

/** @category Validation */
export interface FileValidationResult {
  /** Absolute path validated. */
  path: string;
  /** Path relative to cwd when possible. */
  relativePath: string;
  kind?: string;
  ok: boolean;
  issues: ValidationIssue[];
}

/** @category Validation */
export interface ValidateFilesResult {
  ok: boolean;
  results: FileValidationResult[];
  summary: {
    files: number;
    passed: number;
    failed: number;
    warnings: number;
  };
}

const DEFAULT_PATTERN = /\.mtargets\.(ya?ml|json)$/i;

async function walkFiles(
  dir: string,
  pattern: RegExp,
): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".git" || e.name === "dist") {
        continue;
      }
      out.push(...(await walkFiles(full, pattern)));
    } else if (pattern.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Expand CLI/user inputs into absolute file paths.
 * - Files are kept as-is
 * - Directories are walked for `*.mtargets.yaml|yml|json`
 * - Simple `*` / `**` globs under cwd are expanded by walking the parent dir
 *
 * @param inputs - File paths, directories, or simple globs
 * @param options - `cwd` and optional `filePattern`
 * @returns Sorted absolute paths to mtargets documents
 * @category Validation
 */
export async function expandMtargetsInputs(
  inputs: string[],
  options: Pick<ValidateFilesOptions, "cwd" | "filePattern"> = {},
): Promise<string[]> {
  const cwd = options.cwd ?? process.cwd();
  const pattern = options.filePattern ?? DEFAULT_PATTERN;
  const files = new Set<string>();

  for (const raw of inputs) {
    const input = path.resolve(cwd, raw);

    // Glob-ish: contains * or **
    if (raw.includes("*")) {
      const normalized = raw.replace(/\\/g, "/");
      const star = normalized.indexOf("*");
      const baseRel = star === 0 ? "." : normalized.slice(0, star).replace(/\/$/, "") || ".";
      const baseAbs = path.resolve(cwd, baseRel);
      const walked = await walkFiles(baseAbs, pattern);
      // Optional suffix filter after last /
      const nameGlob = normalized.slice(normalized.lastIndexOf("/") + 1);
      const extMatch = nameGlob.match(/\.mtargets\.(ya?ml|json)$/i);
      for (const f of walked) {
        if (!extMatch || pattern.test(path.basename(f))) {
          files.add(f);
        }
      }
      continue;
    }

    let st;
    try {
      st = await stat(input);
    } catch {
      throw new Error(`Path not found: ${raw}`);
    }
    if (st.isDirectory()) {
      for (const f of await walkFiles(input, pattern)) files.add(f);
    } else {
      files.add(input);
    }
  }

  return [...files].sort();
}

async function validateOneFile(
  filePath: string,
  options: ValidateFilesOptions,
  cwd: string,
): Promise<FileValidationResult> {
  const resolveImports = options.resolveImports !== false;

  // Product schema v0.2 (and legacy v0.1) — no apiVersion/kind
  const text = await readFile(filePath, "utf8");
  const raw = parseDocumentText(text);
  if (isProductSpec(raw)) {
    const validation = validateProductSpec(raw);
    let ok = validation.ok;
    if (
      options.strict &&
      validation.issues.some((i) => i.severity === "warning")
    ) {
      ok = false;
    }
    return {
      path: filePath,
      relativePath: path.relative(cwd, filePath) || filePath,
      kind: "ProductSpec",
      ok,
      issues: validation.issues,
    };
  }

  const loaded = await loadDocumentFile(filePath, { assert: false });
  let validation: ValidationResult = loaded.validation;
  let kind = loaded.document.kind;

  if (resolveImports && loaded.document.kind === "MetricSuite") {
    const resolved = await loadResolvedSuite(filePath, { assert: false });
    validation = resolved.validation;
    kind = resolved.document.kind;
  }

  let ok = validation.ok;
  if (options.strict && validation.issues.some((i) => i.severity === "warning")) {
    ok = false;
  }

  return {
    path: filePath,
    relativePath: path.relative(cwd, filePath) || filePath,
    kind,
    ok,
    issues: validation.issues,
  };
}

/**
 * Validate one or more mtargets files or directories.
 * Suitable for CI and external packages.
 *
 * @param inputs - Files, directories, or simple globs
 * @param options - Import resolution, strict warnings, cwd
 * @returns Per-file results plus aggregate summary
 * @category Validation
 *
 * @example
 * ```ts
 * import { validateFiles } from "mtargets";
 *
 * const result = await validateFiles(["./metrics"], { strict: true });
 * if (!result.ok) process.exit(1);
 * ```
 *
 * @see Guide: docs/guide/validate.md
 */
export async function validateFiles(
  inputs: string[],
  options: ValidateFilesOptions = {},
): Promise<ValidateFilesResult> {
  if (inputs.length === 0) {
    throw new Error("validateFiles: at least one file or directory is required");
  }
  const cwd = options.cwd ?? process.cwd();
  const paths = await expandMtargetsInputs(inputs, options);
  if (paths.length === 0) {
    throw new Error(
      `validateFiles: no mtargets documents matched under ${inputs.join(", ")}`,
    );
  }

  const results: FileValidationResult[] = [];
  for (const filePath of paths) {
    results.push(await validateOneFile(filePath, options, cwd));
  }

  const failed = results.filter((r) => !r.ok).length;
  const warnings = results.reduce(
    (n, r) => n + r.issues.filter((i) => i.severity === "warning").length,
    0,
  );

  return {
    ok: failed === 0,
    results,
    summary: {
      files: results.length,
      passed: results.length - failed,
      failed,
      warnings,
    },
  };
}

/** Pretty-print validateFiles results (CLI / logs). @category Validation */
export function formatValidateFilesResult(
  result: ValidateFilesResult,
): string {
  const lines: string[] = [];
  for (const r of result.results) {
    if (r.ok) {
      const warns = r.issues.filter((i) => i.severity === "warning");
      lines.push(
        warns.length
          ? `OK (with warnings): ${r.relativePath}`
          : `OK: ${r.relativePath}`,
      );
      if (warns.length) lines.push(formatValidationIssues(warns));
    } else {
      lines.push(`FAIL: ${r.relativePath}`);
      lines.push(formatValidationIssues(r.issues));
    }
  }
  lines.push(
    `\n${result.summary.passed}/${result.summary.files} passed` +
      (result.summary.failed ? `, ${result.summary.failed} failed` : "") +
      (result.summary.warnings ? `, ${result.summary.warnings} warning(s)` : ""),
  );
  return lines.join("\n");
}
