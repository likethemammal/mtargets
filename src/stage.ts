/**
 * Stage / environment overlay resolution (promotion gates).
 */
import type {
  MetricSuiteDoc,
  Objective,
  StageOverlay,
} from "./types.js";

function mergeObjective(
  base: Objective,
  override: NonNullable<StageOverlay["objectiveOverrides"]>[number],
): Objective | null {
  if (override.disabled) return null;
  return {
    ...base,
    ...(override.op !== undefined ? { op: override.op } : {}),
    ...(override.value !== undefined ? { value: override.value } : {}),
    ...(override.severity !== undefined ? { severity: override.severity } : {}),
    ...(override.target !== undefined ? { target: override.target } : {}),
    ...(override.targetPercent !== undefined
      ? { targetPercent: override.targetPercent }
      : {}),
    ...(override.errorBudget !== undefined
      ? { errorBudget: override.errorBudget }
      : {}),
    ...(override.distribution !== undefined
      ? { distribution: override.distribution }
      : {}),
  };
}

function resolveStageChain(
  stages: StageOverlay[],
  stageId: string,
): StageOverlay[] {
  const byId = new Map(stages.map((s) => [s.id, s]));
  const chain: StageOverlay[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = stageId;
  while (cur) {
    if (seen.has(cur)) {
      throw new Error(`stage inheritance cycle involving "${cur}"`);
    }
    seen.add(cur);
    const stage = byId.get(cur);
    if (!stage) {
      throw new Error(`unknown stage "${cur}"`);
    }
    chain.unshift(stage);
    cur = stage.inherits;
  }
  return chain;
}

/**
 * Return a suite with stage overlays applied (defaults, policy, objective overrides).
 * Does not mutate the input.
 * @category Evaluation
 */
export function resolveSuiteForStage(
  suite: MetricSuiteDoc,
  stageId: string,
): MetricSuiteDoc {
  const stages = suite.spec.stages ?? [];
  if (stages.length === 0) {
    throw new Error(`suite has no stages; cannot resolve stage "${stageId}"`);
  }
  const chain = resolveStageChain(stages, stageId);

  let defaults = suite.spec.defaults ? { ...suite.spec.defaults } : undefined;
  let policy = suite.spec.policy ? { ...suite.spec.policy } : undefined;
  const overrideMap = new Map<
    string,
    NonNullable<StageOverlay["objectiveOverrides"]>[number]
  >();

  for (const stage of chain) {
    if (stage.defaults) {
      defaults = { ...defaults, ...stage.defaults };
    }
    if (stage.policy) {
      policy = { ...policy, ...stage.policy };
    }
    for (const o of stage.objectiveOverrides ?? []) {
      overrideMap.set(o.objectiveId, {
        ...overrideMap.get(o.objectiveId),
        ...o,
      });
    }
  }

  const objectives: Objective[] = [];
  for (const obj of suite.spec.objectives) {
    const ov = overrideMap.get(obj.id);
    if (!ov) {
      objectives.push(obj);
      continue;
    }
    const merged = mergeObjective(obj, ov);
    if (merged) objectives.push(merged);
  }

  return {
    ...suite,
    spec: {
      ...suite.spec,
      defaults,
      policy,
      objectives,
    },
  };
}
