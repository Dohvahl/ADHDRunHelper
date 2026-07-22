import { DEFAULT_SEEDS, DISTANCE_TOLERANCE, REQUEST_SCALE } from './config.js';
import { fetchRoundTrip } from './ors-client.js';
import { isSafe } from './safety.js';
import { isWithinTolerance, select } from './selector.js';
import { extractTurns } from './turns.js';
import type { Candidate, Route } from './types.js';

/** ORS returned nothing at all for any seed. */
export class NoRouteError extends Error {
  override name = 'NoRouteError';
}

/** ORS returned routes, but every one of them ran on roads we refuse to send a runner down. */
export class NoSafeRouteError extends Error {
  override name = 'NoSafeRouteError';
}

/** Routes existed and were safe, but none landed near the requested distance. */
export class NoRouteInRangeError extends Error {
  override name = 'NoRouteInRangeError';
}

export type RoundTripFetcher = (lat: number, lng: number, lengthM: number, seed: number) => Promise<Candidate | null>;

export interface RouteOptions {
  /** Injected by tests and the dev tools; defaults to the real ORS client. */
  fetcher?: RoundTripFetcher;
  /**
   * Which round_trip seeds to try. Fixed by default so any run can be replayed.
   * Callers that randomise should log what they used.
   */
  seeds?: readonly number[];
  /**
   * Accept routes shorter than the target. Off by default — a short run is a failed
   * run — but it roughly doubles the candidate pool for runners who would rather
   * have a route than have the exact distance.
   */
  allowShorter?: boolean;
}

/**
 * Choose the best loop for this start and target.
 *
 * Every seed is fetched in parallel with no early-out. Stopping at the first
 * acceptable candidate would leave the ranker nothing to compare, and safety only
 * means something when there is a pool to choose from. In flight together, the whole
 * batch costs roughly one request in wall-clock time.
 *
 * The three gates are deliberately distinct so a failure says which one you hit.
 * Returns the whole Candidate, geometry included — the wire contract drops it, but
 * the dev preview needs it to draw the route.
 */
export async function pickBest(
  lat: number,
  lng: number,
  targetM: number,
  options: RouteOptions = {},
): Promise<Candidate> {
  const { fetcher = fetchRoundTrip, seeds = DEFAULT_SEEDS, allowShorter = false } = options;

  // Ask for less than we want: ORS reliably returns ~1.30x the requested length.
  // Everything downstream still measures against the real target.
  const requestM = Math.round(targetM * REQUEST_SCALE);
  const fetched = await Promise.all(seeds.map((seed) => fetcher(lat, lng, requestM, seed)));

  const found = fetched.filter((candidate): candidate is Candidate => candidate !== null);
  if (found.length === 0) {
    throw new NoRouteError('ORS found no route here for any seed');
  }

  const safe = found.filter(isSafe);
  if (safe.length === 0) {
    throw new NoSafeRouteError('every route ORS found runs on roads unsafe on foot');
  }

  const inRange = safe.filter((candidate) => isWithinTolerance(candidate, targetM, allowShorter));
  if (inRange.length === 0) {
    const band = allowShorter
      ? `within ${DISTANCE_TOLERANCE * 100}% of ${targetM}m`
      : `between ${targetM}m and ${Math.round(targetM * (1 + DISTANCE_TOLERANCE))}m`;
    throw new NoRouteInRangeError(`no safe route came ${band}`);
  }

  return select(inRange, targetM);
}

/** The wire contract: the best loop shaped into { distance_m, turns } (no geometry). */
export async function generateRoute(
  lat: number,
  lng: number,
  targetM: number,
  options: RouteOptions = {},
): Promise<Route> {
  const best = await pickBest(lat, lng, targetM, options);
  return {
    distance_m: Math.round(best.distanceM),
    turns: extractTurns(best),
  };
}
