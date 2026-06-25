# Validating mtargets from an outside project

Use **Metric Targets** (`mtargets` npm package) as a **dev dependency** to check that your suites, catalogs, runs, and bindings are syntactically and semantically valid.

## Install

```bash
npm i -D mtargets
# or from a local path while developing:
# npm i -D ../path/to/mtargets
```

Requires Node ≥ 18 (ESM).

## CLI

```bash
# Validate a directory of mtargets files (recursive *.mtargets.yaml|yml|json)
npx mtargets validate ./metrics

# Multiple paths + fail on warnings
npx mtargets validate ./metrics ./more/suite.mtargets.yaml --strict

# Machine-readable output for CI
npx mtargets validate ./metrics --json

# Skip catalog import resolution (local structure only)
npx mtargets validate ./metrics --no-resolve
```

Exit codes: `0` = all ok, `1` = failures (or warnings when `--strict`).

### package.json script

```json
{
  "scripts": {
    "mtargets:validate": "mtargets validate ./metrics --strict"
  }
}
```

### GitHub Actions

```yaml
- name: Validate mtargets
  run: npx mtargets validate ./metrics --strict --json
```

## This package’s examples

From the `mtargets` repo itself:

```bash
npm run validate:examples          # all examples/**/*.mtargets.yaml
npx mtargets validate ./examples
npm test                           # includes tests for the validate-examples script
```

## Programmatic API

```ts
import {
  validateFiles,
  expandMtargetsInputs,
  validateDocument,
  parseDocumentText,
  loadResolvedSuite,
  formatValidateFilesResult,
} from "mtargets";

// Preferred for projects: files / dirs
const result = await validateFiles(["./metrics"], {
  strict: true,
  resolveImports: true, // default
});

if (!result.ok) {
  console.error(formatValidateFilesResult(result));
  process.exit(1);
}

// Expand paths only (no validate)
const paths = await expandMtargetsInputs(["./metrics"]);

// Single in-memory document
const doc = parseDocumentText(yamlText);
const { ok, issues } = validateDocument(doc);

// Suite with catalogs resolved (absolute or relative path)
const { document: suite, validation } = await loadResolvedSuite(
  "./metrics/checkout.mtargets.yaml",
);
```

### `validateFiles` result shape

```ts
{
  ok: boolean;
  summary: { files, passed, failed, warnings };
  results: Array<{
    path: string;
    relativePath: string;
    kind?: "MetricSuite" | "MetricRun" | "MetricCatalog" | "MetricBinding";
    ok: boolean;
    issues: Array<{ path: string; message: string; severity: "error" | "warning" }>;
  }>;
}
```

## What validation checks

- Envelope: `apiVersion: mtargets/v1`, `kind`, `metadata.id` / `title`
- Closed enums: `kind`, `op`, `severity`, subject/indicator kinds, …
- Cross-refs: objectives → indicators, indicators → subjects, composites, evidence
- Suite catalog **imports** (when resolve is on): merged then re-validated
- Id pattern `^[a-z0-9][a-z0-9_-]*$`

It does **not** call Lighthouse/Sentry or verify that `source.query` is executable — that is the runner’s job.

## JSON Schema (editors)

Schemas ship with the package for IDE autocomplete:

```text
node_modules/mtargets/schema/metric-suite.schema.json
node_modules/mtargets/schema/metric-run.schema.json
node_modules/mtargets/schema/metric-catalog.schema.json
node_modules/mtargets/schema/metric-binding.schema.json
```

Point your editor’s YAML schema association at these files. Prefer `mtargets validate` / `validateFiles` for CI — they enforce cross-refs Schema alone cannot.

## Local path install (monorepo)

```bash
# from your app package
npm i -D file:../mtargets
npm run build --prefix ../mtargets   # ensure dist/ exists
npx mtargets validate ./metrics
```
