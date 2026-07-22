import { describe, expect, it, vi } from 'vitest';
import {
  NoRouteError,
  NoRouteInRangeError,
  NoSafeRouteError,
  generateRoute,
  pickBest,
  type RoundTripFetcher,
} from '../src/generator.js';
import { Waytype, type Candidate, type Coord } from '../src/types.js';
import { REQUEST_SCALE } from '../src/config.js';

const GEOMETRY: Coord[] = [
  [0, 0],
  [0.001, 0],
  [0.002, 0],
];

/** Seeds are injected everywhere, so tests never depend on the production defaults. */
const SEEDS = [10, 20, 30, 40];

/** What a 5000m target actually asks ORS for: 5000 * REQUEST_SCALE (0.77). */
const SCALED_5K = 5000 * REQUEST_SCALE;

/** All-footway, so it clears the safety gate. */
function candidate(distanceM: number): Candidate {
  return {
    distanceM,
    geometry: GEOMETRY,
    steps: [{ type: 0, way_points: [1, 2] }],
    waytypes: [{ value: Waytype.FOOTWAY, distance: distanceM, amount: 100 }],
  };
}

/** Same distance, but along a trunk road — must never be accepted. */
function unsafeCandidate(distanceM: number): Candidate {
  return {
    ...candidate(distanceM),
    waytypes: [{ value: Waytype.STATE_ROAD, distance: distanceM, amount: 100 }],
  };
}

/** Serves one scripted candidate per seed, in the order the seeds were given. */
function fetcherOf(bySeedIndex: Array<Candidate | null>): RoundTripFetcher {
  return vi.fn(async (_lat, _lng, _lengthM, seed) => {
    const index = SEEDS.indexOf(seed);
    return bySeedIndex[index] ?? null;
  });
}

describe('generateRoute', () => {
  it('fetches every seed rather than stopping at the first usable one', async () => {
    // No early-out: safety can only rank a pool, so we always collect the whole pool.
    const fetcher = fetcherOf([candidate(5000), candidate(5000), candidate(5000), candidate(5000)]);
    await generateRoute(51.5, -0.12, 5000, { fetcher, seeds: SEEDS });
    expect(fetcher).toHaveBeenCalledTimes(SEEDS.length);
  });

  it('uses the seeds it is given, not the production defaults', async () => {
    const fetcher = fetcherOf([candidate(5000), null, null, null]);
    await generateRoute(51.5, -0.12, 5000, { fetcher, seeds: SEEDS });
    for (const seed of SEEDS) {
      expect(fetcher).toHaveBeenCalledWith(51.5, -0.12, SCALED_5K, seed);
    }
  });

  it('asks ORS for less than the target, because ORS overshoots', async () => {
    // Measured over 40 seeds at two distances: ORS returns ~1.30x the requested
    // length, so asking for 77% centres the results on what was actually wanted.
    const fetcher = fetcherOf([candidate(5000)]);
    await generateRoute(51.5, -0.12, 5000, { fetcher, seeds: SEEDS });
    expect(fetcher).toHaveBeenCalledWith(51.5, -0.12, SCALED_5K, expect.any(Number));
  });

  it('judges the tolerance band against the real target, not the scaled request', async () => {
    // 5000m is dead on a 5000m target, but would sit far outside a band drawn around
    // the 3850m request. Confusing the two silently rejects every good route.
    const fetcher = fetcherOf([candidate(5000)]);
    const route = await generateRoute(51.5, -0.12, 5000, { fetcher, seeds: SEEDS });
    expect(route.distance_m).toBe(5000);
  });

  it('includes the extracted turns in the route', async () => {
    const fetcher = fetcherOf([candidate(5000)]);
    const route = await generateRoute(51.5, -0.12, 5000, { fetcher, seeds: SEEDS });
    expect(route.turns).toEqual([{ lat: 0, lng: 0.001, dir: 'left' }]);
  });

  it('rounds the reported distance to whole metres', async () => {
    const fetcher = fetcherOf([candidate(5012.7)]);
    const route = await generateRoute(51.5, -0.12, 5000, { fetcher, seeds: SEEDS });
    expect(route.distance_m).toBe(5013);
  });

  it('lets an error from the fetcher propagate instead of swallowing it', async () => {
    // An outage is not a dead seed: it must surface, not be mistaken for "no route".
    const fetcher = vi.fn(async () => {
      throw new Error('ORS is unreachable');
    });
    await expect(generateRoute(51.5, -0.12, 5000, { fetcher, seeds: SEEDS })).rejects.toThrow('ORS is unreachable');
  });
});

describe('generateRoute: the three gates', () => {
  it('throws NoRouteError when ORS returns nothing for any seed', async () => {
    const fetcher = fetcherOf([null, null, null, null]);
    await expect(generateRoute(51.5, -0.12, 5000, { fetcher, seeds: SEEDS })).rejects.toThrow(NoRouteError);
  });

  it('throws NoSafeRouteError when every route runs on a trunk road', async () => {
    // Refusing is correct. Handing back a trunk-road route would not be.
    const fetcher = fetcherOf([
      unsafeCandidate(5000),
      unsafeCandidate(5000),
      unsafeCandidate(5000),
      unsafeCandidate(5000),
    ]);
    await expect(generateRoute(51.5, -0.12, 5000, { fetcher, seeds: SEEDS })).rejects.toThrow(NoSafeRouteError);
  });

  it('throws NoRouteInRangeError when safe routes exist but none is near the target', async () => {
    // The 10129m "5k" case: safe enough, but not remotely the run that was asked for.
    const fetcher = fetcherOf([candidate(10129), candidate(7269), candidate(6000), null]);
    await expect(generateRoute(51.5, -0.12, 5000, { fetcher, seeds: SEEDS })).rejects.toThrow(NoRouteInRangeError);
  });

  it('discards unsafe candidates but keeps the safe ones', async () => {
    const fetcher = fetcherOf([unsafeCandidate(5000), candidate(5100), null, null]);
    const route = await generateRoute(51.5, -0.12, 5000, { fetcher, seeds: SEEDS });
    expect(route.distance_m).toBe(5100);
  });

  it('discards over-long candidates but keeps the in-band ones', async () => {
    const fetcher = fetcherOf([candidate(5668), candidate(5200), null, null]);
    const route = await generateRoute(51.5, -0.12, 5000, { fetcher, seeds: SEEDS });
    expect(route.distance_m).toBe(5200);
  });
});

describe('generateRoute: allowShorter', () => {
  it('rejects a short route by default', async () => {
    // 4800m is only 4% short and would once have been accepted. The default is now
    // "reach the target or refuse", because a short run is a failed run.
    const fetcher = fetcherOf([candidate(4800), null, null, null]);
    await expect(generateRoute(51.5, -0.12, 5000, { fetcher, seeds: SEEDS })).rejects.toThrow(NoRouteInRangeError);
  });

  it('accepts a short route when the runner opts in', async () => {
    const fetcher = fetcherOf([candidate(4800), null, null, null]);
    const route = await generateRoute(51.5, -0.12, 5000, { fetcher, seeds: SEEDS, allowShorter: true });
    expect(route.distance_m).toBe(4800);
  });

  it('still rejects over-long routes when short ones are allowed', async () => {
    // allowShorter opens the lower side only; the upper allowance is unchanged.
    const fetcher = fetcherOf([candidate(6000), null, null, null]);
    await expect(generateRoute(51.5, -0.12, 5000, { fetcher, seeds: SEEDS, allowShorter: true })).rejects.toThrow(
      NoRouteInRangeError,
    );
  });

  it('still prefers reaching the target when both are available', async () => {
    const fetcher = fetcherOf([candidate(4800), candidate(5200), null, null]);
    const route = await generateRoute(51.5, -0.12, 5000, { fetcher, seeds: SEEDS, allowShorter: true });
    expect(route.distance_m).toBe(5200);
  });
});

describe('pickBest', () => {
  it('returns the chosen candidate with its geometry intact', async () => {
    // The preview tool needs the geometry that the wire contract throws away.
    const fetcher = fetcherOf([candidate(5000)]);
    const best = await pickBest(51.5, -0.12, 5000, { fetcher, seeds: SEEDS });
    expect(best.distanceM).toBe(5000);
    expect(best.geometry).toEqual(GEOMETRY);
  });
});
