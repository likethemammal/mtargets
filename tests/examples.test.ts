import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateSuite } from "../src/evaluate.js";
import { suiteToGherkin } from "../src/gherkin.js";
import { loadDocumentFile, loadSuite } from "../src/load.js";
import type { IndicatorObservation } from "../src/types.js";
import { readFile } from "node:fs/promises";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("examples", () => {
  it("validates every examples/ document via validateFiles", async () => {
    const { validateFiles } = await import("../src/validate-files.js");
    const result = await validateFiles([path.join(root, "examples")], {
      cwd: root,
      resolveImports: true,
    });
    expect(result.summary.failed).toBe(0);
    expect(result.ok).toBe(true);
    expect(result.summary.files).toBeGreaterThanOrEqual(38);
  });

  it("validates checkout-quality suite", async () => {
    const { validation } = await loadDocumentFile(
      path.join(root, "examples/suites/checkout-quality.mtargets.yaml"),
      { assert: false },
    );
    expect(validation.ok).toBe(true);
  });

  it("validates catalog and binding", async () => {
    for (const rel of [
      "examples/catalogs/web-defaults.mtargets.yaml",
      "examples/bindings/checkout-quality.binding.mtargets.yaml",
    ]) {
      const { validation } = await loadDocumentFile(path.join(root, rel), {
        assert: false,
      });
      expect(validation.ok, rel).toBe(true);
    }
  });

  it("evaluates pass observations to pass", async () => {
    const { document: suite } = await loadSuite(
      path.join(root, "examples/suites/checkout-quality.mtargets.yaml"),
    );
    const obs = JSON.parse(
      await readFile(
        path.join(root, "examples/observations/checkout-pass.json"),
        "utf8",
      ),
    ) as IndicatorObservation[];
    const run = evaluateSuite(suite, obs);
    expect(run.spec.status).toBe("pass");
  });

  it("evaluates fail-lcp observations to fail", async () => {
    const { document: suite } = await loadSuite(
      path.join(root, "examples/suites/checkout-quality.mtargets.yaml"),
    );
    const obs = JSON.parse(
      await readFile(
        path.join(root, "examples/observations/checkout-fail-lcp.json"),
        "utf8",
      ),
    ) as IndicatorObservation[];
    const run = evaluateSuite(suite, obs);
    expect(run.spec.status).toBe("fail");
    expect(
      run.spec.results.find((r) => r.objectiveId === "lcp-good")?.status,
    ).toBe("fail");
    expect(
      run.spec.results.find((r) => r.objectiveId === "js-budget")?.status,
    ).toBe("warn");
  });

  it("validates integration example suites", async () => {
    for (const rel of [
      "examples/suites/lighthouse-ci.mtargets.yaml",
      "examples/suites/error-tracking.mtargets.yaml",
      "examples/suites/custom-product.mtargets.yaml",
      "examples/suites/ux-granularity.mtargets.yaml",
      "examples/suites/network-conditions.mtargets.yaml",
      "examples/suites/api-data.mtargets.yaml",
      "examples/bindings/lighthouse-ci.binding.mtargets.yaml",
      "examples/bindings/error-tracking.binding.mtargets.yaml",
      "examples/bindings/custom-product.binding.mtargets.yaml",
      "examples/bindings/ux-granularity.binding.mtargets.yaml",
      "examples/bindings/network-conditions.binding.mtargets.yaml",
      "examples/bindings/api-data.binding.mtargets.yaml",
    ]) {
      const { validation } = await loadDocumentFile(path.join(root, rel), {
        assert: false,
      });
      expect(validation.ok, rel).toBe(true);
    }
  });

  it("evaluates lighthouse observations to pass", async () => {
    const { document: suite } = await loadSuite(
      path.join(root, "examples/suites/lighthouse-ci.mtargets.yaml"),
    );
    const obs = JSON.parse(
      await readFile(
        path.join(root, "examples/observations/lighthouse-pass.json"),
        "utf8",
      ),
    ) as IndicatorObservation[];
    const run = evaluateSuite(suite, obs);
    expect(run.spec.status).toBe("pass");
  });

  it("evaluates custom-product observations to pass", async () => {
    const { document: suite } = await loadSuite(
      path.join(root, "examples/suites/custom-product.mtargets.yaml"),
    );
    const obs = JSON.parse(
      await readFile(
        path.join(root, "examples/observations/custom-product-pass.json"),
        "utf8",
      ),
    ) as IndicatorObservation[];
    const run = evaluateSuite(suite, obs);
    expect(run.spec.status).toBe("pass");
  });

  it("evaluates ux-granularity / network / api-data observations to pass", async () => {
    for (const [suiteRel, obsRel] of [
      ["examples/suites/ux-granularity.mtargets.yaml", "examples/observations/ux-granularity-pass.json"],
      ["examples/suites/network-conditions.mtargets.yaml", "examples/observations/network-conditions-pass.json"],
      ["examples/suites/api-data.mtargets.yaml", "examples/observations/api-data-pass.json"],
    ] as const) {
      const { document: suite } = await loadSuite(path.join(root, suiteRel));
      const obs = JSON.parse(
        await readFile(path.join(root, obsRel), "utf8"),
      ) as IndicatorObservation[];
      const run = evaluateSuite(suite, obs);
      expect(run.spec.status, suiteRel).toBe("pass");
    }
  });

  it("evaluates all generated catalog suites to pass", async () => {
    const suitesDir = path.join(root, "examples/suites");
    const { readdir } = await import("node:fs/promises");
    const { loadResolvedSuite } = await import("../src/load.js");
    const files = (await readdir(suitesDir)).filter((f) =>
      f.startsWith("catalog-"),
    );
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const file of files) {
      const id = file.replace(/\.mtargets\.ya?ml$/i, "");
      const { document: suite, validation } = await loadResolvedSuite(
        path.join(suitesDir, file),
      );
      expect(validation.ok, file).toBe(true);
      expect(suite.spec.indicators.length).toBeGreaterThan(0);
      expect(suite.spec.objectives.length).toBe(suite.spec.indicators.length);
      const obs = JSON.parse(
        await readFile(
          path.join(root, "examples/observations", `${id}-pass.json`),
          "utf8",
        ),
      ) as IndicatorObservation[];
      const run = evaluateSuite(suite, obs);
      expect(run.spec.status, id).toBe("pass");
    }
  });

  it("projects gherkin from suite", async () => {
    const { document: suite } = await loadSuite(
      path.join(root, "examples/suites/checkout-quality.mtargets.yaml"),
    );
    const feature = suiteToGherkin(suite);
    expect(feature).toContain("Feature: Checkout quality bar");
    expect(feature).toContain("Scenario:");
    expect(feature).toContain("lcp-good");
  });
});
