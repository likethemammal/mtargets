import { describe, expect, it } from "vitest";
import { parseDocumentText } from "../src/parse.js";
import { validateDocument } from "../src/validate.js";

const minimalSuite = `
apiVersion: mtargets/v1
kind: MetricSuite
metadata:
  id: smoke
  title: Smoke
spec:
  subjects:
    - id: app
      type: surface
  indicators:
    - id: latency
      kind: timing
      unit: ms
      subjectRef: app
      source:
        type: http
        query: duration
      aggregate: p95
  objectives:
    - id: latency-ok
      indicator: latency
      op: lt
      value: 500
      severity: error
`;

describe("parse + validate", () => {
  it("accepts a minimal suite", () => {
    const doc = parseDocumentText(minimalSuite);
    const result = validateDocument(doc);
    expect(result.ok).toBe(true);
  });

  it("rejects wrong apiVersion", () => {
    const doc = parseDocumentText(minimalSuite.replace("mtargets/v1", "mtargets/v0"));
    const result = validateDocument(doc);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.path === "apiVersion")).toBe(true);
  });

  it("rejects unknown indicator ref", () => {
    const bad = minimalSuite.replace("indicator: latency", "indicator: nope");
    const result = validateDocument(parseDocumentText(bad));
    expect(result.ok).toBe(false);
  });

  it("rejects missing subjectRef with multiple subjects", () => {
    const doc = parseDocumentText(`
apiVersion: mtargets/v1
kind: MetricSuite
metadata:
  id: multi
  title: Multi
spec:
  subjects:
    - id: a
      type: surface
    - id: b
      type: service
  indicators:
    - id: x
      kind: gauge
      unit: "1"
      source: { type: manual }
  objectives:
    - id: o
      indicator: x
      op: eq
      value: 1
      severity: error
`);
    const result = validateDocument(doc);
    expect(result.ok).toBe(false);
  });

  it("parses JSON documents", () => {
    const doc = parseDocumentText(
      JSON.stringify({
        apiVersion: "mtargets/v1",
        kind: "MetricBinding",
        metadata: { id: "b", title: "B" },
        spec: { suiteId: "smoke" },
      }),
    );
    expect(validateDocument(doc).ok).toBe(true);
  });

  it("accepts provider, hook, and unit subject types", () => {
    const doc = parseDocumentText(`
apiVersion: mtargets/v1
kind: MetricSuite
metadata:
  id: layers
  title: Layers
spec:
  subjects:
    - id: p
      type: provider
    - id: h
      type: hook
    - id: u
      type: unit
  indicators:
    - id: x
      kind: gauge
      unit: "1"
      scope: suite
      source: { type: manual }
  objectives:
    - id: o
      indicator: x
      op: eq
      value: 1
      severity: error
`);
    expect(validateDocument(doc).ok).toBe(true);
  });
});
