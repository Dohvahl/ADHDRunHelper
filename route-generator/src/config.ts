export const ORS_BASE_URL = 'https://api.openrouteservice.org';
export const ORS_PROFILE = 'foot-walking';

/**
 * Default seeds, fixed so any run can be replayed. ORS treats `round_trip.seed` as
 * the shape of the loop, so a spread of values explores genuinely different routes.
 * Seeds are injectable everywhere — pass your own to explore, but log what you used:
 * a bad route you cannot reproduce is a bad route you cannot debug.
 */
export const DEFAULT_SEEDS: readonly number[] = [34, 47, 48, 56, 64, 80, 82, 96, 119];

/** Random seeds for exploration. Log the result if you use these. */
export function randomSeeds(count: number): number[] {
  return Array.from({ length: count }, () => Math.floor(Math.random() * 1000));
}

/**
 * Candidates further than this fraction from the target are discarded outright.
 * ORS's round_trip length is a loose suggestion — a 5 km request has returned
 * 10 km — so without a band the distance rules end up choosing between routes
 * that are all wrong, and can prefer a dangerous 5668 m over a safe 4787 m.
 */
export const DISTANCE_TOLERANCE = 0.1;

/**
 * ORS overshoots `round_trip.length` by a consistent ~1.30x, so we ask for less
 * than we want. Measured over 40 seeds at two distances: requesting 3760 m returned
 * a 4899 m median against a 5000 m target (1.303x), and 7500 m returned 9713 m
 * against 10000 m (1.295x). Centring the distribution on the target took the
 * in-band hit rate from 15% to 35-43%.
 *
 * Applies to the length we REQUEST. The tolerance band is always judged against the
 * real target — confusing the two silently rejects every good route.
 */
export const REQUEST_SCALE = 0.76;

/**
 * Safety scores are compared at this granularity when ranking candidates. Comparing
 * raw floats makes safety win every time — two routes are never exactly equal — which
 * silently kills every ranking key below it. Rounding to buckets means a clearly safer
 * route still wins, while similar routes let distance decide.
 */
export const SAFETY_GRANULARITY = 0.1;

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
export const ROUND_TRIP_POINTS = 6;

/**
 * NOTE: no `quiet`/`green` weighting here on purpose. They are documented foot-profile
 * options, but the public ORS instance rejects them (engine 9.9.0 answers 400, code
 * 2002 "Parameter 'options' has incorrect value or format") because they depend on
 * optional data layers it was not built with. Adding them back will break every
 * request. Real up-front biasing has to wait for a self-hosted engine.
 */

export function orsApiKey(): string {
  const key = process.env.ORS_API_KEY;
  if (!key) {
    throw new Error('ORS_API_KEY is not set');
  }
  return key;
}
