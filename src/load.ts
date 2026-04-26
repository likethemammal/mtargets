import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseDocumentText } from "./parse.js";
import {
  assertValidDocument,
  validateDocument,
  type ValidationResult,
} from "./validate.js";
import type {
  MetricBindingDoc,
  MetricCatalogDoc,
  MetricRunDoc,
  MetricSuiteDoc,
  MtargetsDocument,
} from "./types.js";

/** @category Loading */
export interface LoadOptions {
  /** If true (default), throw on validation errors. */
  assert?: boolean;
}

/** @category Loading */
export interface LoadResult<T extends MtargetsDocument = MtargetsDocument> {
  document: T;
  validation: ValidationResult;
  path?: string;
}

/**
 * Load and optionally validate an mtargets document from disk.
 * @category Loading
 */
export async function loadDocumentFile(
  filePath: string,
  options: LoadOptions = {},
): Promise<LoadResult> {
  const text = await readFile(filePath, "utf8");
  return loadDocumentText(text, { ...options, path: filePath });
}

/**
 * Parse and optionally validate document text (YAML or JSON).
 * @category Loading
 */
export function loadDocumentText(
  text: string,
  options: LoadOptions & { path?: string } = {},
): LoadResult {
  const raw = parseDocumentText(text);
  const validation = validateDocument(raw);
  if (options.assert !== false && !validation.ok) {
    assertValidDocument(raw);
  }
  return {
    document: raw as MtargetsDocument,
    validation,
    path: options.path,
  };
}

/** Load a file and assert `kind: MetricSuite`. @category Loading */
export async function loadSuite(
  filePath: string,
  options?: LoadOptions,
): Promise<LoadResult<MetricSuiteDoc>> {
  const result = await loadDocumentFile(filePath, options);
  if (result.document.kind !== "MetricSuite") {
    throw new Error(
      `Expected MetricSuite in ${filePath}, got ${result.document.kind}`,
    );
  }
  return result as LoadResult<MetricSuiteDoc>;
}

/** Load a file and assert `kind: MetricRun`. @category Loading */
export async function loadRun(
  filePath: string,
  options?: LoadOptions,
): Promise<LoadResult<MetricRunDoc>> {
  const result = await loadDocumentFile(filePath, options);
  if (result.document.kind !== "MetricRun") {
    throw new Error(
      `Expected MetricRun in ${filePath}, got ${result.document.kind}`,
    );
  }
  return result as LoadResult<MetricRunDoc>;
}

/** Load a file and assert `kind: MetricCatalog`. @category Loading */
export async function loadCatalog(
  filePath: string,
  options?: LoadOptions,
): Promise<LoadResult<MetricCatalogDoc>> {
  const result = await loadDocumentFile(filePath, options);
  if (result.document.kind !== "MetricCatalog") {
    throw new Error(
      `Expected MetricCatalog in ${filePath}, got ${result.document.kind}`,
    );
  }
  return result as LoadResult<MetricCatalogDoc>;
}

/** Load a file and assert `kind: MetricBinding`. @category Loading */
export async function loadBinding(
  filePath: string,
  options?: LoadOptions,
): Promise<LoadResult<MetricBindingDoc>> {
  const result = await loadDocumentFile(filePath, options);
  if (result.document.kind !== "MetricBinding") {
    throw new Error(
      `Expected MetricBinding in ${filePath}, got ${result.document.kind}`,
    );
  }
  return result as LoadResult<MetricBindingDoc>;
}

/**
 * Resolve catalog imports into a suite (shallow merge).
 * Catalog paths are resolved relative to the suite file directory.
 * @category Loading
 */
export async function resolveSuiteImports(
  suite: MetricSuiteDoc,
  suiteFilePath: string,
): Promise<MetricSuiteDoc> {
  if (!suite.spec.imports?.length) return suite;

  const baseDir = path.dirname(suiteFilePath);
  const subjects = [...(suite.spec.subjects ?? [])];
  const indicators = [...suite.spec.indicators];
  const subjectIds = new Set(subjects.map((s) => s.id));
  const indicatorIds = new Set(indicators.map((i) => i.id));

  for (const imp of suite.spec.imports) {
    const catalogPath = path.resolve(baseDir, imp.catalog);
    const { document: catalog } = await loadCatalog(catalogPath);

    for (const s of catalog.spec.subjects ?? []) {
      if (imp.subjects && !imp.subjects.includes(s.id)) continue;
      if (subjectIds.has(s.id)) continue; // suite-local wins
      subjects.push(s);
      subjectIds.add(s.id);
    }

    for (const ind of catalog.spec.indicators ?? []) {
      if (imp.indicators && !imp.indicators.includes(ind.id)) continue;
      if (indicatorIds.has(ind.id)) continue;
      indicators.push(ind);
      indicatorIds.add(ind.id);
    }
  }

  return {
    ...suite,
    spec: {
      ...suite.spec,
      subjects,
      indicators,
    },
  };
}

/**
 * Load a suite and resolve catalog imports, then validate the merged document.
 * @category Loading
 */
export async function loadResolvedSuite(
  filePath: string,
  options?: LoadOptions,
): Promise<LoadResult<MetricSuiteDoc>> {
  const loaded = await loadSuite(filePath, { ...options, assert: false });
  const resolved = await resolveSuiteImports(loaded.document, filePath);
  const validation = validateDocument(resolved);
  if (options?.assert !== false && !validation.ok) {
    assertValidDocument(resolved);
  }
  return {
    document: resolved,
    validation,
    path: filePath,
  };
}
