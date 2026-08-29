import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateFiles } from "../src/validate-files.js";
import {
  formatValidateExamplesResult,
  validateExamples,
  walkMtargetsDocs,
} from "../scripts/validate-examples.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const examples = path.join(root, "examples");

function runNode(
  args: string[],
  cwd = root,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env: process.env,
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

describe("validateExamples script", () => {
  it("walkMtargetsDocs finds all example documents", async () => {
    const files = await walkMtargetsDocs(examples);
    expect(files.length).toBeGreaterThanOrEqual(38);
    expect(
      files.every((f) => /\.mtargets\.(ya?ml|json)$/i.test(f)),
    ).toBe(true);
    // All four document kinds should appear under examples/
    const names = files.map((f) => path.basename(f));
    expect(names.some((n) => n.includes("binding"))).toBe(true);
    expect(files.some((f) => f.includes(`${path.sep}suites${path.sep}`))).toBe(
      true,
    );
    expect(files.some((f) => f.includes(`${path.sep}catalogs${path.sep}`))).toBe(
      true,
    );
    expect(files.some((f) => f.includes(`${path.sep}runs${path.sep}`))).toBe(
      true,
    );
  });

  it("validateExamples passes for every examples/ document", async () => {
    const result = await validateExamples(examples, { cwd: root });
    expect(result.files).toBeGreaterThanOrEqual(38);
    expect(result.failed).toBe(0);
    expect(result.ok).toBe(true);
    expect(result.passed).toBe(result.files);

    const kinds = new Set(result.results.map((r) => r.kind));
    expect(kinds.has("MetricSuite")).toBe(true);
    expect(kinds.has("MetricCatalog")).toBe(true);
    expect(kinds.has("MetricRun")).toBe(true);
    expect(kinds.has("MetricBinding")).toBe(true);

    const text = formatValidateExamplesResult(result);
    expect(text).toMatch(/passed/);
    expect(text).toContain("OK");
  });

  it("validateFiles covers the entire examples tree", async () => {
    const result = await validateFiles([examples], {
      cwd: root,
      resolveImports: true,
    });
    expect(result.ok).toBe(true);
    expect(result.summary.files).toBeGreaterThanOrEqual(38);
    expect(result.summary.failed).toBe(0);
  });

  it("npm run validate:examples exits 0", async () => {
    const { code, stdout, stderr } = await runNode(
      [
        path.join(root, "node_modules/tsx/dist/cli.mjs"),
        path.join(root, "scripts/validate-examples.ts"),
      ],
      root,
    );
    expect(stderr, stderr).not.toMatch(/FAIL /);
    expect(code).toBe(0);
    expect(stdout).toMatch(/Validated \d+ document/);
  });

  it("CLI validate ./examples exits 0", async () => {
    const { code, stdout, stderr } = await runNode(
      [
        path.join(root, "node_modules/tsx/dist/cli.mjs"),
        path.join(root, "src/cli.ts"),
        "validate",
        "./examples",
      ],
      root,
    );
    expect(code, stderr || stdout).toBe(0);
    expect(stdout).toMatch(/\d+\/\d+ passed/);
  });
});
