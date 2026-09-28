import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { parseDocumentText } from "../src/parse.js";
import { parseProductData } from "../src/product-data.js";
import { assertValidProductSpec } from "../src/product-schema.js";
import {
  applyProductBaselines,
  compareProductActual,
  findMatchingRouteKey,
  matchRoutePattern,
  productValidateExitCode,
  validateProductActuals,
} from "../src/product-validate.js";

const execFileAsync = promisify(execFile);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const productDir = path.join(root, "examples", "product");
const cliTs = path.join(root, "src", "cli.ts");
/** Prefer node + tsx CLI entry (works on Windows; `.bin/tsx` is not execFile-safe). */
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");

function loadFixture(name: string): unknown {
  return parseDocumentText(
    readFileSync(path.join(productDir, name), "utf8"),
  );
}

describe("product data parsing", () => {
  it("parses metrics map and actuals list shapes", () => {
    const fromMap = parseProductData(loadFixture("actuals-sample.json"));
    expect(fromMap.dataSource).toContain("pino-postgres");
    expect(fromMap.actuals).toEqual(
      expect.arrayContaining([
        { key: "lcp", actual: 1800 },
        { key: "lcp", actual: 1850, route: "/rating" },
        { key: "lcp", actual: 3900, route: "/curation/styles" },
        { key: "lighthouse-perf", actual: 92 },
      ]),
    );

    const fromList = parseProductData({
      dataSource: "list",
      actuals: [{ key: "x", actual: 1, route: "/a" }],
    });
    expect(fromList.actuals).toEqual([{ key: "x", actual: 1, route: "/a" }]);
  });
});

describe("compareProductActual + direction", () => {
  it("lower-is-better: pass / warn / fail", () => {
    const tiers = { good: 2500, warn: 4000 };
    expect(compareProductActual(2000, tiers, "lower-is-better")).toBe("pass");
    expect(compareProductActual(2500, tiers, "lower-is-better")).toBe("pass");
    expect(compareProductActual(3000, tiers, "lower-is-better")).toBe("warn");
    expect(compareProductActual(4000, tiers, "lower-is-better")).toBe("warn");
    expect(compareProductActual(5000, tiers, "lower-is-better")).toBe("fail");
  });

  it("higher-is-better: pass / warn / fail", () => {
    const tiers = { good: 90, warn: 75 };
    expect(compareProductActual(95, tiers, "higher-is-better")).toBe("pass");
    expect(compareProductActual(90, tiers, "higher-is-better")).toBe("pass");
    expect(compareProductActual(80, tiers, "higher-is-better")).toBe("warn");
    expect(compareProductActual(75, tiers, "higher-is-better")).toBe("warn");
    expect(compareProductActual(60, tiers, "higher-is-better")).toBe("fail");
  });

  it("without warn, beyond good is fail", () => {
    expect(compareProductActual(10, { good: 5 }, "lower-is-better")).toBe(
      "fail",
    );
    expect(compareProductActual(5, { good: 10 }, "higher-is-better")).toBe(
      "fail",
    );
  });
});

describe("route matching", () => {
  it("matches exact and trailing glob", () => {
    expect(matchRoutePattern("/rating", "/rating")).toBe(true);
    expect(
      matchRoutePattern("/scheduling/sched-*", "/scheduling/sched-1"),
    ).toBe(true);
    expect(matchRoutePattern("/scheduling/sched-*", "/rating")).toBe(false);
  });

  it("findMatchingRouteKey prefers exact then longest glob", () => {
    const metric = assertValidProductSpec({
      name: "r",
      metrics: {
        lcp: {
          tiers: { good: 1 },
          per_route: {
            "/scheduling/sched-*": { baseline: 1 },
            "/scheduling/sched-special": { baseline: 2 },
          },
        },
      },
    }).metrics.lcp;
    expect(findMatchingRouteKey(metric, "/scheduling/sched-special")).toBe(
      "/scheduling/sched-special",
    );
    expect(findMatchingRouteKey(metric, "/scheduling/sched-9")).toBe(
      "/scheduling/sched-*",
    );
  });
});

describe("validateProductActuals", () => {
  const raw = loadFixture("v0.2-minimal.mtargets.json");
  const spec = assertValidProductSpec(raw);
  const data = parseProductData(loadFixture("actuals-sample.json"));

  it("produces Part 3 report with pass/warn and exit codes", () => {
    const report = validateProductActuals(spec, data.actuals, {
      dataSource: data.dataSource,
      evaluatedAt: "2026-07-11T00:00:00.000Z",
    });
    expect(report.spec).toBe("product-v02-minimal@0.2.0");
    expect(report.evaluatedAt).toBe("2026-07-11T00:00:00.000Z");
    expect(report.dataSource).toContain("pino-postgres");

    const rating = report.results.find(
      (r) => r.key === "lcp" && r.route === "/rating",
    );
    expect(rating?.status).toBe("pass");
    expect(rating?.actual).toBe(1850);
    expect(rating?.delta_from_baseline).toBe(1850 - 1200);

    const curation = report.results.find(
      (r) => r.key === "lcp" && r.route === "/curation/styles",
    );
    expect(curation?.status).toBe("warn");
    expect(curation?.actual).toBe(3900);

    const lh = report.results.find((r) => r.key === "lighthouse-perf");
    expect(lh?.status).toBe("pass");
    expect(lh?.actual).toBe(92);

    expect(report.summary.warn).toBeGreaterThanOrEqual(1);
    expect(report.summary.fail).toBe(0);
    expect(productValidateExitCode(report.summary)).toBe(1);
  });

  it("filters by suite and route", () => {
    const suiteOnly = validateProductActuals(spec, data.actuals, {
      suite: "cwv",
      dataSource: "t",
    });
    expect(suiteOnly.results.every((r) => r.key === "lcp")).toBe(true);

    const routeOnly = validateProductActuals(spec, data.actuals, {
      route: "/rating",
      dataSource: "t",
    });
    expect(routeOnly.results.some((r) => r.route === "/rating")).toBe(true);
    expect(
      routeOnly.results.every(
        (r) => r.key !== "lcp" || r.route === "/rating",
      ),
    ).toBe(true);
  });

  it("marks missing actuals as noData and exit 0 when only noData/pass", () => {
    const report = validateProductActuals(
      spec,
      [{ key: "lighthouse-perf", actual: 95 }],
      { dataSource: "partial", evaluatedAt: "2026-07-11T00:00:00.000Z" },
    );
    expect(report.summary.noData).toBeGreaterThan(0);
    expect(report.summary.fail).toBe(0);
    expect(report.summary.warn).toBe(0);
    expect(productValidateExitCode(report.summary)).toBe(0);
  });

  it("exit 2 when any fail", () => {
    const report = validateProductActuals(
      spec,
      [
        { key: "lcp", actual: 9000, route: "/rating" },
        { key: "lighthouse-perf", actual: 50 },
      ],
      { dataSource: "bad" },
    );
    expect(report.summary.fail).toBeGreaterThan(0);
    expect(productValidateExitCode(report.summary)).toBe(2);
  });
});

describe("applyProductBaselines", () => {
  it("writes metric and per_route baselines", () => {
    const raw = loadFixture("v0.2-minimal.mtargets.json") as Record<
      string,
      unknown
    >;
    const spec = assertValidProductSpec(raw);
    const { document, updated } = applyProductBaselines(
      raw,
      spec,
      [
        { key: "lcp", actual: 1111 },
        { key: "lcp", actual: 2222, route: "/rating" },
        { key: "lighthouse-perf", actual: 88 },
      ],
    );
    const metrics = document.metrics as Record<
      string,
      { baseline?: number; per_route?: Record<string, { baseline?: number }> }
    >;
    expect(metrics.lcp.baseline).toBe(1111);
    expect(metrics.lcp.per_route?.["/rating"]?.baseline).toBe(2222);
    expect(metrics["lighthouse-perf"].baseline).toBe(88);
    expect(updated.length).toBe(3);
  });
});

describe("CLI integration: validate --spec / baseline", () => {
  async function runCli(
    args: string[],
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    try {
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        [tsxCli, cliTs, ...args],
        {
          cwd: root,
          maxBuffer: 2 * 1024 * 1024,
        },
      );
      return { code: 0, stdout, stderr };
    } catch (err: unknown) {
      const e = err as {
        code?: number;
        stdout?: string;
        stderr?: string;
      };
      return {
        code: typeof e.code === "number" ? e.code : 1,
        stdout: e.stdout ?? "",
        stderr: e.stderr ?? "",
      };
    }
  }

  it("validate --spec --data prints JSON report and exit 1 on warn", async () => {
    const result = await runCli([
      "validate",
      "--spec",
      path.join(productDir, "v0.2-minimal.mtargets.json"),
      "--data",
      path.join(productDir, "actuals-sample.json"),
    ]);
    expect(result.code).toBe(1);
    const report = JSON.parse(result.stdout) as {
      summary: { warn: number; fail: number };
      results: unknown[];
    };
    expect(report.summary.warn).toBeGreaterThanOrEqual(1);
    expect(report.summary.fail).toBe(0);
    expect(report.results.length).toBeGreaterThan(0);
  });

  it("validate --suite / --route filters", async () => {
    const result = await runCli([
      "validate",
      "--spec",
      path.join(productDir, "v0.2-minimal.mtargets.json"),
      "--data",
      path.join(productDir, "actuals-sample.json"),
      "--suite",
      "cwv",
      "--route",
      "/rating",
    ]);
    expect(result.code).toBe(0);
    const report = JSON.parse(result.stdout) as {
      results: Array<{ key: string; route?: string; status: string }>;
    };
    expect(report.results.every((r) => r.key === "lcp")).toBe(true);
    expect(report.results.every((r) => r.route === "/rating")).toBe(true);
  });

  it("baseline writes baselines to output file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mtargets-baseline-"));
    const out = path.join(dir, "updated.mtargets.json");
    const result = await runCli([
      "baseline",
      "--spec",
      path.join(productDir, "v0.2-minimal.mtargets.json"),
      "--data",
      path.join(productDir, "actuals-sample.json"),
      "--output",
      out,
    ]);
    expect(result.code).toBe(0);
    const updated = JSON.parse(await readFile(out, "utf8")) as {
      metrics: {
        lcp: {
          baseline: number;
          per_route: Record<string, { baseline: number }>;
        };
        "lighthouse-perf": { baseline: number };
      };
    };
    expect(updated.metrics.lcp.baseline).toBe(1800);
    expect(updated.metrics.lcp.per_route["/rating"].baseline).toBe(1850);
    expect(updated.metrics.lcp.per_route["/curation/styles"].baseline).toBe(
      3900,
    );
    expect(updated.metrics["lighthouse-perf"].baseline).toBe(92);
  });

  it("document validate still works without --spec", async () => {
    const result = await runCli(["validate", productDir]);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/passed|OK|ProductSpec/i);
  });
});
