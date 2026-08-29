import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  expandMtargetsInputs,
  formatValidateFilesResult,
  validateFiles,
} from "../src/validate-files.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const examples = path.join(root, "examples");

describe("validateFiles (external API)", () => {
  it("validates a directory of mtargets documents", async () => {
    const result = await validateFiles([path.join(examples, "suites")], {
      cwd: root,
    });
    expect(result.summary.files).toBeGreaterThan(5);
    expect(result.ok).toBe(true);
    expect(result.results.every((r) => r.kind === "MetricSuite")).toBe(true);
  });

  it("validates catalog imports when resolving suites", async () => {
    const result = await validateFiles(
      [path.join(examples, "suites/catalog-web-ux-perf.mtargets.yaml")],
      { cwd: root, resolveImports: true },
    );
    expect(result.ok).toBe(true);
    expect(result.summary.files).toBe(1);
  });

  it("returns ok false for invalid documents", async () => {
    const { writeFile, mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const dir = await mkdtemp(path.join(tmpdir(), "mtargets-val-"));
    try {
      const bad = path.join(dir, "bad.mtargets.yaml");
      await writeFile(
        bad,
        `apiVersion: mtargets/v0\nkind: MetricSuite\nmetadata:\n  id: x\n  title: X\nspec:\n  indicators: []\n  objectives: []\n`,
        "utf8",
      );
      const result = await validateFiles([bad], { cwd: dir });
      expect(result.ok).toBe(false);
      expect(result.summary.failed).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("expandMtargetsInputs walks directories", async () => {
    const files = await expandMtargetsInputs([path.join(examples, "catalogs")], {
      cwd: root,
    });
    expect(files.some((f) => f.includes("catalog-web-ux-perf"))).toBe(true);
  });

  it("formatValidateFilesResult includes summary", async () => {
    const result = await validateFiles(
      [path.join(examples, "catalogs/web-defaults.mtargets.yaml")],
      { cwd: root },
    );
    const text = formatValidateFilesResult(result);
    expect(text).toContain("passed");
    expect(text).toMatch(/OK:/);
  });
});
