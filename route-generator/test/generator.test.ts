import { describe, expect, it, vi } from 'vitest';
import { NoRouteError, generateRoute, pickBest, type RoundTripFetcher } from '../src/generator.js';
import type { Candidate, Coord } from '../src/types.js';

const GEOMETRY: Coord[] = [
  [0, 0],
  [0.001, 0],
  [0.002, 0],
];

function candidate(distanceM: number): Candidate {
  return { distanceM, geometry: GEOMETRY, steps: [{ type: 0, way_points: [1, 2] }] };
}

/** Serves a scripted distance per seed, so we can assert exactly which seeds ran. */
function fetcherFor(distancesBySeed: Array<number | null>): RoundTripFetcher {
  return vi.fn(async (_lat, _lng, _lengthM, seed) => {
    const distance = distancesBySeed[seed];
    return distance === null || distance === undefined ? null : candidate(distance);
  });
}

describe('generateRoute', () => {
  it('stops calling ORS as soon as a candidate is good enough', async () => {
    const fetcher = fetcherFor([9000, 5050, 5000, 5000]);
    const route = await generateRoute(51.5, -0.12, 5000, fetcher);

    expect(route.distance_m).toBe(5050);
    // Seeds 0 and 1 only — seed 1 was within 100m, so 2 and 3 never ran.
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('tries every seed and picks the smallest overshoot when none is good enough', async () => {
    const fetcher = fetcherFor([9000, 8000, 6000, 3000]);
    const route = await generateRoute(51.5, -0.12, 5000, fetcher);

    expect(route.distance_m).toBe(6000);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('passes the start and target through to the fetcher unchanged', async () => {
    const fetcher = fetcherFor([5000]);
    await generateRoute(51.5, -0.12, 5000, fetcher);
    // lat, lng, lengthM, seed — the target is the requested length.
    expect(fetcher).toHaveBeenCalledWith(51.5, -0.12, 5000, 0);
  });

  it('skips seeds that produce no route', async () => {
    const fetcher = fetcherFor([null, null, 8000, 7000]);
    const route = await generateRoute(51.5, -0.12, 5000, fetcher);
    expect(route.distance_m).toBe(7000);
  });

  it('includes the extracted turns in the route', async () => {
    const fetcher = fetcherFor([5000, 5000, 5000, 5000]);
    const route = await generateRoute(51.5, -0.12, 5000, fetcher);
    expect(route.turns).toEqual([{ lat: 0, lng: 0.001, dir: 'left' }]);
  });

  it('rounds the reported distance to whole metres', async () => {
    const fetcher = fetcherFor([5012.7]);
    const route = await generateRoute(51.5, -0.12, 5000, fetcher);
    expect(route.distance_m).toBe(5013);
  });

  it('throws NoRouteError when every seed comes back empty', async () => {
    const fetcher = fetcherFor([null, null, null, null]);
    await expect(generateRoute(51.5, -0.12, 5000, fetcher)).rejects.toThrow(NoRouteError);
  });

  it('lets an OrsError from the fetcher propagate instead of swallowing it', async () => {
    // A thrown fetcher error is an outage, not a dead seed — it must NOT be
    // treated as "no route" and must stop the run rather than trying more seeds.
    const fetcher = vi.fn(async () => {
      throw new Error('ORS is unreachable');
    });
    await expect(generateRoute(51.5, -0.12, 5000, fetcher)).rejects.toThrow('ORS is unreachable');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('pickBest', () => {
  it('returns the chosen candidate with its geometry intact', async () => {
    // generateRoute is built on this; the preview tool relies on the geometry the
    // wire contract drops, so pin that pickBest hands the whole Candidate back.
    const fetcher = fetcherFor([5000]);
    const best = await pickBest(51.5, -0.12, 5000, fetcher);
    expect(best.distanceM).toBe(5000);
    expect(best.geometry).toEqual(GEOMETRY);
  });

  it('throws NoRouteError when every seed comes back empty', async () => {
    const fetcher = fetcherFor([null, null, null, null]);
    await expect(pickBest(51.5, -0.12, 5000, fetcher)).rejects.toThrow(NoRouteError);
  });
});
