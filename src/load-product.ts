/**
 * Load a product schema file (JSON/YAML) and return normalized v0.2 spec.
 * @category ProductSchema
 */

import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { assertValidProductSpec } from "./product-schema.js";
import type { NormalizedProductSpec } from "./product-types.js";

/**
 * Parse product spec text (JSON or YAML).
 * @category ProductSchema
 */
export function parseProductSpecText(text: string): NormalizedProductSpec {
  const trimmed = text.trimStart();
  let parsed: unknown;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    parsed = JSON.parse(text) as unknown;
  } else {
    parsed = parseYaml(text) as unknown;
  }
  return assertValidProductSpec(parsed);
}

/**
 * Load and normalize a product spec from disk.
 * @category ProductSchema
 */
export async function loadProductSpecFile(
  filePath: string,
): Promise<NormalizedProductSpec> {
  const text = await readFile(filePath, "utf8");
  return parseProductSpecText(text);
}
