import { DISTANCE_TOLERANCE, SAFETY_GRANULARITY } from './config.js';
import { safetyScore } from './safety.js';
import type { Candidate } from './types.js';

/**
 * Is this candidate an acceptable length? Anything outside the band is discarded
 * before ranking, so distance is a gate rather than a preference.
 *
 * The band is asymmetric by default: overshooting is cooldown, but finishing a "5k"
 * at 4.8km is the failure a runner actually notices. `allowShorter` opens the lower
 * side for runners who would rather have a route than have the exact distance —
 * it roughly doubles the pool, which matters when candidates are scarce.
 */
export function isWithinTolerance(candidate: Candidate, targetM: number, allowShorter = false): boolean {
  const allowance = targetM * DISTANCE_TOLERANCE;
  const delta = candidate.distanceM - targetM;

  if (delta > allowance) {
    return false; // too long, whatever the runner prefers
  }
  if (delta >= 0) {
    return true; // reaches the target
  }
  return allowShorter && -delta <= allowance;
}

/**
 * Pick the winner from candidates that have already passed the safety and distance
 * gates, in priority order:
 *   1. meaningfully safer (safety score, compared in buckets)
 *   2. reaches the target — a short run is a failed run; the extra is cooldown
 *   3. closest to the target
 *
 * Safety is bucketed on purpose. Compared as raw floats it would win every single
 * time, because two routes never score exactly alike, and everything below it would
 * never be consulted. Bucketing means a clearly safer route still wins while similar
 * routes are settled on distance.
 *
 * Does not mutate the caller's array.
 */
export function select(candidates: Candidate[], targetM: number): Candidate {
  if (candidates.length === 0) {
    throw new Error('no candidates to select from');
  }
  return [...candidates].sort((a, b) => compare(a, b, targetM))[0];
}

function safetyBucket(candidate: Candidate): number {
  return Math.round(safetyScore(candidate) / SAFETY_GRANULARITY);
}

function compare(a: Candidate, b: Candidate, targetM: number): number {
  const bySafety = safetyBucket(b) - safetyBucket(a);
  if (bySafety !== 0) {
    return bySafety;
  }

  // Reaching the target beats being close to it: finishing a "5k" at 4.8km is the
  // failure a runner actually notices. Anything past the target is cooldown.
  const aReachesTarget = a.distanceM >= targetM;
  const bReachesTarget = b.distanceM >= targetM;
  if (aReachesTarget !== bReachesTarget) {
    return aReachesTarget ? -1 : 1;
  }

  return Math.abs(a.distanceM - targetM) - Math.abs(b.distanceM - targetM);
}
