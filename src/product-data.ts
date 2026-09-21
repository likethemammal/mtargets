/**
 * Actuals data loading for product validate / report CLI.
 *
 * Supports offline JSON (`--data`) shaped for pino-postgres exports.
 * @category ProductValidate
 */

import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

/** One observed actual for a metric (optionally route-scoped). @category ProductValidate */
export interface ProductActual {
  key: string;
  actual: number;
  route?: string;
}

/** Parsed data file for validate/report. @category ProductValidate */
export interface ProductDataFile {
  dataSource: string;
  actuals: ProductActual[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Normalize flexible JSON/YAML actuals into a flat list.
 *
 * Accepted shapes:
 * 1. `{ dataSource?, actuals: [{ key, actual, route? }] }`
 * 2. `{ dataSource?, metrics: { key: number | { actual, routes?: { route: number } } } }`
 * 3. bare array `[{ key, actual, route? }]`
 * @category ProductValidate
 */
export function parseProductData(input: unknown): ProductDataFile {
  if (Array.isArray(input)) {
    return {
      dataSource: "inline-actuals",
      actuals: parseActualsList(input, "actuals"),
    };
  }

  if (!isRecord(input)) {
    throw new Error("product data must be an object or array");
  }

  const dataSource =
    typeof input.dataSource === "string" && input.dataSource
      ? input.dataSource
      : typeof input.source === "string" && input.source
        ? input.source
        : "data-file";

  if (Array.isArray(input.actuals)) {
    return {
      dataSource,
      actuals: parseActualsList(input.actuals, "actuals"),
    };
  }

  if (isRecord(input.metrics)) {
    const actuals: ProductActual[] = [];
    for (const [key, raw] of Object.entries(input.metrics)) {
      if (typeof raw === "number") {
        if (Number.isNaN(raw)) {
          throw new Error(`metrics.${key}: actual must be a number`);
        }
        actuals.push({ key, actual: raw });
        continue;
      }
      if (!isRecord(raw)) {
        throw new Error(`metrics.${key}: must be a number or object`);
      }
      if (raw.actual !== undefined) {
        if (typeof raw.actual !== "number" || Number.isNaN(raw.actual)) {
          throw new Error(`metrics.${key}.actual: must be a number`);
        }
        actuals.push({ key, actual: raw.actual });
      }
      if (raw.routes !== undefined) {
        if (!isRecord(raw.routes)) {
          throw new Error(`metrics.${key}.routes: must be an object`);
        }
        for (const [route, value] of Object.entries(raw.routes)) {
          if (typeof value !== "number" || Number.isNaN(value)) {
            throw new Error(
              `metrics.${key}.routes[${JSON.stringify(route)}]: must be a number`,
            );
          }
          actuals.push({ key, actual: value, route });
        }
      }
      if (raw.actual === undefined && raw.routes === undefined) {
        throw new Error(`metrics.${key}: provide actual and/or routes`);
      }
    }
    return { dataSource, actuals };
  }

  throw new Error("product data must include actuals[] or metrics{} map");
}

function parseActualsList(list: unknown[], path: string): ProductActual[] {
  const out: ProductActual[] = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const p = `${path}[${i}]`;
    if (!isRecord(item)) {
      throw new Error(`${p}: must be an object`);
    }
    if (typeof item.key !== "string" || !item.key) {
      throw new Error(`${p}.key: required string`);
    }
    if (typeof item.actual !== "number" || Number.isNaN(item.actual)) {
      throw new Error(`${p}.actual: must be a number`);
    }
    const entry: ProductActual = { key: item.key, actual: item.actual };
    if (item.route !== undefined) {
      if (typeof item.route !== "string") {
        throw new Error(`${p}.route: must be a string`);
      }
      entry.route = item.route;
    }
    out.push(entry);
  }
  return out;
}

/**
 * Load and parse a `--data` JSON/YAML file.
 * @category ProductValidate
 */
export async function loadProductDataFile(
  filePath: string,
): Promise<ProductDataFile> {
  const text = await readFile(filePath, "utf8");
  const trimmed = text.trimStart();
  let parsed: unknown;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    parsed = JSON.parse(text) as unknown;
  } else {
    parsed = parseYaml(text) as unknown;
  }
  return parseProductData(parsed);
}
