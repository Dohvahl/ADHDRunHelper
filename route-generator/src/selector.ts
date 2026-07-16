import { EARLY_OUT_M } from './config.js';
import type { Candidate } from './types.js';

/** Within EARLY_OUT_M of target, either direction: close enough to stop looking. */
export function isGoodEnough(candidate: Candidate, targetM: number): boolean {
  return Math.abs(candidate.distanceM - targetM) <= EARLY_OUT_M;
}

/**
 * The single authority on which candidate wins:
 *   1. any good-enough candidate, else
 *   2. the smallest overshoot, else
 *   3. the closest by absolute difference.
 * Throws if given no candidates.
 */
export function select(candidates: Candidate[], targetM: number): Candidate {
  if (candidates.length === 0) throw new Error('no candidates');

  const goodEnoughCandidate = candidates.find((c) => isGoodEnough(c, targetM));
  if (goodEnoughCandidate) return goodEnoughCandidate;

  const overshoots = candidates.filter((c) => c.distanceM >= targetM);
  if (overshoots.length > 0) {
    return overshoots.reduce((best, c) => (c.distanceM < best.distanceM ? c : best));
  }
  return candidates.reduce((best, c) =>
    Math.abs(c.distanceM - targetM) < Math.abs(best.distanceM - targetM) ? c : best,
  );
}
