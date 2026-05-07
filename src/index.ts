/**
 * @packageDocumentation
 * Metric Targets — TypeScript library for the mtargets file format.
 *
 * Parse, validate, and evaluate measurable quality targets
 * (UX, reliability, cost, evals, tests).
 *
 * Package / format / CLI: `mtargets` (`apiVersion: mtargets/v1`, `*.mtargets.yaml`).
 * Guides: `docs/guide/` · Format: `docs/reference/` · Site: `website/` · API docs: `/api/`.
 */

export { API_VERSION } from "./types.js";
export type * from "./types.js";

export {
  AGGREGATE_METHODS,
  DOCUMENT_KINDS,
  DURATION_SHORTHAND,
  ID_PATTERN,
  INDICATOR_KINDS,
  OPS,
  RECOMMENDED_SOURCE_TYPES,
  SEVERITIES,
  SUBJECT_TYPES,
  WINDOW_TYPES,
  includesEnum,
  isAggregateMethod,
  normalizeAggregate,
  normalizeWindow,
} from "./constants.js";

export { parseDocumentText, parseDocumentUnsafe, MtargetsParseError } from "./parse.js";

export {
  validateDocument,
  assertValidDocument,
  formatValidationIssues,
  type ValidationIssue,
  type ValidationResult,
  type ValidationSeverity,
} from "./validate.js";

export {
  evaluateSuite,
  compareObjective,
} from "./evaluate.js";

export { resolveSuiteForStage } from "./stage.js";

export {
  resolveRatioObserved,
  ratioSourceComplete,
} from "./ratio.js";

export {
  importOpenSlo,
  importBudgetJson,
  importK6Thresholds,
  type OpenSloLike,
  type LighthouseBudget,
} from "./interop.js";

export {
  checkDrift,
  checkQueries,
  suiteToAlertSnapshot,
  type DeclaredAlertSnapshot,
  type DriftIssue,
  type DriftResult,
  type QueryCheckIssue,
  type QueryCheckResult,
} from "./drift.js";

export {
  loadDocumentFile,
  loadDocumentText,
  loadSuite,
  loadRun,
  loadCatalog,
  loadBinding,
  resolveSuiteImports,
  loadResolvedSuite,
  type LoadOptions,
  type LoadResult,
} from "./load.js";

export {
  validateFiles,
  expandMtargetsInputs,
  formatValidateFilesResult,
  type ValidateFilesOptions,
  type ValidateFilesResult,
  type FileValidationResult,
} from "./validate-files.js";

export { suiteToGherkin } from "./gherkin.js";

export {
  PRODUCT_SCHEMA_ID,
  PRODUCT_SCHEMA_VERSION,
  type ProductPercentile,
  type ProductMetricSource,
  type ProductCategory,
  type ProductDirection,
  type ProductTiers,
  type ProductRouteOverride,
  type ProductMetric,
  type NormalizedProductMetric,
  type ProductSpecDoc,
  type NormalizedProductSpec,
} from "./product-types.js";

export {
  isProductSpec,
  normalizeProductSpec,
  validateProductSpec,
  assertValidProductSpec,
  resolveProductTiers,
  PRODUCT_PERCENTILES,
  PRODUCT_METRIC_SOURCES,
  PRODUCT_CATEGORIES,
  PRODUCT_DIRECTIONS,
} from "./product-schema.js";

export {
  parseProductData,
  loadProductDataFile,
  type ProductActual,
  type ProductDataFile,
} from "./product-data.js";

export {
  matchRoutePattern,
  findMatchingRouteKey,
  compareProductActual,
  productValidateExitCode,
  validateProductActuals,
  applyProductBaselines,
  type ProductResultStatus,
  type ProductValidateResultRow,
  type ProductValidateReport,
  type ProductValidateOptions,
  type ProductBaselineOptions,
} from "./product-validate.js";

export { formatAgentMarkdown } from "./product-report.js";

export {
  generateLighthousercAssertions,
  generateLighthousercConfig,
  formatLighthousercFile,
  inferLighthousercFormat,
  toLhciMinScore,
  type LhciAssertionLevel,
  type LhciAssertion,
  type LighthousercConfig,
  type GenerateLighthousercOptions,
} from "./generate-lighthouserc.js";

export {
  parseProductSpecText,
  loadProductSpecFile,
} from "./load-product.js";

