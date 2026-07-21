import { Candidate, Waytype, WaytypeSummary } from './types.js';

/**
 * Determines whether a candidate is safe enough to be returned to the user. This is a
 * "fail closed" filter: if we cannot verify that the route is safe, we reject it.
 * The rules are:
 *   1. Any route that touches a State Road (trunk/primary/motorway) is rejected.
 *   2. Any route with no waytype data at all is rejected.
 *   3. Otherwise, the route is accepted.
 * The rules are intentionally simple and conservative, because the ORS waytype data is
 * not perfect. It lumps some dangerous roads in with harmless ones, so we cannot rely
 * on it to be a perfect classifier. We only use it to reject obviously unsafe routes.
 * The scoring function is used to pick the best candidate from the remaining pool.
 */
export function isSafe(candidate: Candidate): boolean {
  if (candidate.waytypes.length == 0) return false;

  return !candidate.waytypes.some((t) => {
    return (t.value & Waytype.EXCLUDED) > 0;
  });
}

export function safetyScore(candidate: Candidate): number {
  const totalDistance = candidate.waytypes.map((t) => t.distance).reduce((accum, curr) => accum + curr, 0);
  if (totalDistance <= 0) return 0;

  const preferredDistance = candidate.waytypes
    .map((t) => flaggedDistance(t, Waytype.PREFERRED))
    .reduce((accum, curr) => accum + curr, 0);
  const penalisedDistance = candidate.waytypes
    .map((t) => flaggedDistance(t, Waytype.PENALISED))
    .reduce((accum, curr) => accum + curr, 0);

  return +((preferredDistance - penalisedDistance) / totalDistance).toFixed(4); // TODO
}

function flaggedDistance(summary: WaytypeSummary, checkFlag: Waytype): number {
  return (summary.value & checkFlag) > 0 ? summary.distance : 0;
}
