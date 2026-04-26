import { parse as parseYaml } from "yaml";
import type { MtargetsDocument } from "./types.js";

/** Thrown when YAML/JSON cannot be parsed into a document object. @category Parsing */
export class MtargetsParseError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "MtargetsParseError";
  }
}

/**
 * Parse YAML or JSON text into a plain object.
 * Does not validate mtargets semantics — use `validateDocument`.
 *
 * @category Parsing
 */
export function parseDocumentText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new MtargetsParseError("Document is empty");
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch (err) {
      throw new MtargetsParseError("Invalid JSON", err);
    }
  }

  try {
    return parseYaml(trimmed) as unknown;
  } catch (err) {
    throw new MtargetsParseError("Invalid YAML", err);
  }
}

/**
 * Parse and cast to MtargetsDocument without validation.
 * @category Parsing
 */
export function parseDocumentUnsafe(text: string): MtargetsDocument {
  return parseDocumentText(text) as MtargetsDocument;
}
