import { ORS_BASE_URL, ORS_PROFILE, ROUND_TRIP_POINTS, orsApiKey } from './config.js';
import type { Candidate, Coord, OrsStep } from './types.js';

/** ORS said no (network, rate limit, bad request) — distinct from "no route exists". */
export class OrsError extends Error {
  override name = 'OrsError';
}

interface OrsGeoJson {
  features?: Array<{
    geometry: { coordinates: Coord[] };
    properties: {
      summary: { distance: number };
      segments: Array<{ steps: OrsStep[] }>;
    };
  }>;
}

/** One ORS round_trip attempt. Null when ORS simply couldn't find a loop for this seed. */
export async function fetchRoundTrip(
  lat: number,
  lng: number,
  lengthM: number,
  seed: number,
): Promise<Candidate | null> {
  // Only the network call is wrapped. fetch() rejects solely on a transport-level
  // failure (unreachable host, DNS, abort) — that genuinely is ORS's problem, so
  // surface it as an OrsError (which the server maps to 502).
  const response = await fetch(`${ORS_BASE_URL}/v2/directions/${ORS_PROFILE}/geojson`, {
    method: 'POST',
    headers: {
      Authorization: orsApiKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      coordinates: [[lng, lat]], // ORS wants [lng, lat]
      options: { round_trip: { length: lengthM, points: ROUND_TRIP_POINTS, seed } },
    }),
    signal: AbortSignal.timeout(1_000),
  }).catch((error: unknown) => {
    throw new OrsError('ORS is unreachable', { cause: error });
  });

  // A non-2xx response is still ORS answering — its problem, so also an OrsError.
  if (!response.ok) {
    throw new OrsError(`ORS request failed with status ${response.status}`);
  }

  // Everything below is OUR parsing of ORS's payload. If ORS sends a shape we
  // don't expect, that's a bug in us — let the raw error propagate (a 500) rather
  // than laundering it into an OrsError (a 502 that would blame ORS for our miss).
  const data = (await response.json()) as OrsGeoJson;
  const feature = data.features?.[0];
  if (!feature) {
    return null;
  }

  const { geometry, properties } = feature;
  return {
    distanceM: properties.summary.distance,
    geometry: geometry.coordinates,
    steps: properties.segments.flatMap((segment) => segment.steps),
  };
}
