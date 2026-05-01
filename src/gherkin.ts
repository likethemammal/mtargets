import type { MetricSuiteDoc } from "./types.js";
import { normalizeAggregate, normalizeWindow } from "./constants.js";

/**
 * Project a MetricSuite into Gherkin feature text (non-normative readability aid).
 * YAML remains the source of truth.
 * @category Projection
 */
export function suiteToGherkin(suite: MetricSuiteDoc): string {
  const lines: string[] = [];
  const tags = (suite.metadata.tags ?? []).map((t) => `@${t}`).join(" ");
  if (tags) lines.push(tags);
  lines.push(`Feature: ${suite.metadata.title}`);
  if (suite.spec.intent) {
    for (const para of suite.spec.intent.trim().split(/\n+/)) {
      lines.push(`  ${para.trim()}`);
    }
  }
  lines.push("");

  for (const objective of suite.spec.objectives) {
    const indicator = suite.spec.indicators.find(
      (i) => i.id === objective.indicator,
    );
    const subject =
      indicator?.subjectRef &&
      suite.spec.subjects?.find((s) => s.id === indicator.subjectRef);

    const agg = normalizeAggregate(indicator?.aggregate);
    const window = normalizeWindow(
      indicator?.window ?? suite.spec.defaults?.window,
    );

    if (objective.labels?.channel) {
      lines.push(`  @channel-${objective.labels.channel}`);
    }
    lines.push(`  Scenario: ${objective.title ?? objective.id}`);
    if (subject) {
      lines.push(`    Given subject ${subject.id}`);
    } else if (indicator?.scope === "suite") {
      lines.push(`    Given suite scope`);
    }
    const aggText = agg?.method ?? "observed";
    const windowText = window
      ? window.type === "rolling"
        ? `rolling ${window.duration}`
        : window.type
      : "default window";
    lines.push(
      `    When indicator ${objective.indicator} is aggregated ${aggText} over ${windowText}`,
    );
    const valueText =
      typeof objective.value === "object"
        ? JSON.stringify(objective.value)
        : String(objective.value);
    lines.push(
      `    Then objective ${objective.id} expects ${objective.op} ${valueText}${indicator?.unit ? ` ${indicator.unit}` : ""} with severity ${objective.severity}`,
    );
    if (objective.target !== undefined) {
      lines.push(
        `    And compliance target is ${objective.target}`,
      );
    }
    lines.push("");
  }

  for (const composite of suite.spec.composites ?? []) {
    lines.push(`  Scenario: Composite ${composite.title ?? composite.id}`);
    lines.push(`    Given composite mode ${composite.mode}`);
    for (const m of composite.objectives) {
      lines.push(
        `    And member objective ${m.ref}${m.key ? " (key)" : ""}${m.weight != null ? ` weight ${m.weight}` : ""}`,
      );
    }
    if (composite.totalScore?.pass !== undefined) {
      lines.push(`    Then total score pass threshold is ${composite.totalScore.pass}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}
