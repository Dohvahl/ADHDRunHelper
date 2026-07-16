export const ORS_BASE_URL = 'https://api.openrouteservice.org';
export const ORS_PROFILE = 'foot-walking';

/** Fixed seeds keep generation deterministic and reproducible across runs. */
export const CANDIDATE_SEEDS = [0, 1, 2, 3];

/** A candidate this close to target is good enough — stop calling ORS. */
export const EARLY_OUT_M = 100;

/** ~110 m cache cells, so the same house rounds to a single key. */
export const ROUND_DECIMALS = 3;

/**
 * Part of every cache key. Bump whenever the shape of `Route` changes: cached
 * entries live in a file that outlives a deploy, and a stale row would otherwise
 * deserialise into the new shape with fields silently missing. Bumping makes old
 * entries stop matching, so they're regenerated instead. Superseded rows are left
 * behind as dead weight, which is fine at this scale.
 */
export const CACHE_VERSION = 1;

/** ORS's documented round_trip ceiling. */
export const MAX_DISTANCE_M = 100_000;

/** How many waypoints ORS uses to shape the loop. */
export const ROUND_TRIP_POINTS = 3;

export function orsApiKey(): string {
  const key = process.env.ORS_API_KEY;
  if (!key) {
    throw new Error('ORS_API_KEY is not set');
  }
  return key;
}
