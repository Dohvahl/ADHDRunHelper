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

/** Ask ORS for up to CANDIDATE_SEEDS.length loops and return the best one. */
export async function generateRoute(
  lat: number,
  lng: number,
  targetM: number,
  fetcher: RoundTripFetcher = fetchRoundTrip,
): Promise<Route> {
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

  const bestCandidate = select(candidates, targetM);
  return {
    distance_m: Math.round(bestCandidate.distanceM),
    turns: extractTurns(bestCandidate),
  };
}
