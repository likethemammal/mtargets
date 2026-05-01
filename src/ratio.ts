/**
 * Ratio SLI helpers (OpenSLO-compatible good/bad/total).
 */
import type { IndicatorObservation, Source } from "./types.js";

/** True when a ratio source has enough fields to evaluate. @category Evaluation */
export function ratioSourceComplete(source: Source): boolean {
  if (source.rawType !== undefined && source.query !== undefined) return true;
  const hasNumerator = source.good !== undefined || source.bad !== undefined;
  return hasNumerator && source.total !== undefined;
}

/**
 * Compute observed ratio from parts when runner supplies `ratio:{good,bad,total}`.
 * `rawType` success → good/total; failure → bad/total (or 1 - good/total).
 * @category Evaluation
 */
export function resolveRatioObserved(
  source: Source,
  obs: IndicatorObservation | undefined,
): number | null {
  if (obs?.observed !== null && obs?.observed !== undefined) {
    const n = typeof obs.observed === "number" ? obs.observed : Number(obs.observed);
    if (Number.isFinite(n)) return n;
  }
  const parts = obs?.ratio;
  if (!parts) return null;

  const total = parts.total;
  if (typeof total !== "number" || total <= 0) return null;

  if (typeof parts.good === "number") {
    if (source.rawType === "failure") return 1 - parts.good / total;
    return parts.good / total;
  }
  if (typeof parts.bad === "number") {
    if (source.rawType === "success") return 1 - parts.bad / total;
    return parts.bad / total;
  }
  return null;
}
