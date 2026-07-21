import { CANDIDATE_SEEDS } from './config.js';
import { fetchRoundTrip } from './ors-client.js';
import { isGoodEnough, select } from './selector.js';
import { extractTurns } from './turns.js';
import type { Candidate, Route } from './types.js';

/** ORS answered fine, but no usable loop exists here. */
export class NoRouteError extends Error {
  override name = 'NoRouteError';
}

export type RoundTripFetcher = (lat: number, lng: number, lengthM: number, seed: number) => Promise<Candidate | null>;

/**
 * Choose the best loop for this start + target from up to CANDIDATE_SEEDS.length
 * ORS attempts. Returns the whole Candidate, geometry included — callers that need
 * the actual path (the dev preview) get it; generateRoute discards it.
 */
export async function pickBest(
  lat: number,
  lng: number,
  targetM: number,
  fetcher: RoundTripFetcher = fetchRoundTrip,
): Promise<Candidate> {
  const candidates: Candidate[] = [];
  for (const seed of CANDIDATE_SEEDS) {
    const candidate = await fetcher(lat, lng, targetM, seed);
    if (candidate) {
      candidates.push(candidate);
      if (isGoodEnough(candidate, targetM)) {
        break;
      }
    }
  }
  if (candidates.length === 0) {
    throw new NoRouteError('ORS could not find a route for any seed');
  }
  return select(candidates, targetM);
}

/** The wire contract: the best loop shaped into { distance_m, turns } (no geometry). */
export async function generateRoute(
  lat: number,
  lng: number,
  targetM: number,
  fetcher: RoundTripFetcher = fetchRoundTrip,
): Promise<Route> {
  const best = await pickBest(lat, lng, targetM, fetcher);
  return {
    distance_m: Math.round(best.distanceM),
    turns: extractTurns(best),
  };
}
