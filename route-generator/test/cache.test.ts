import { afterEach, describe, expect, it } from 'vitest';
import { RouteCache, cacheKey } from '../src/cache.js';
import { CACHE_VERSION } from '../src/config.js';
import type { Route } from '../src/types.js';

const ROUTE: Route = {
  distance_m: 5012,
  turns: [{ lat: 51.5, lng: -0.12, dir: 'left' }],
};

let cache: RouteCache | undefined;

afterEach(() => {
  cache?.close();
  cache = undefined;
});

describe('cacheKey', () => {
  it('collapses points within the same ~110m cell to one key', () => {
    // ~11m apart: the bedroom, the living room and the front step are one start.
    expect(cacheKey(51.50001, -0.12001, 5000)).toBe(cacheKey(51.50004, -0.12004, 5000));
  });

  it('separates points in different cells', () => {
    expect(cacheKey(51.5, -0.12, 5000)).not.toBe(cacheKey(51.6, -0.12, 5000));
  });

  it('separates different distances at the same place', () => {
    expect(cacheKey(51.5, -0.12, 5000)).not.toBe(cacheKey(51.5, -0.12, 10000));
  });

  it('rounds to exactly 3 decimal places, padding shorter values', () => {
    expect(cacheKey(51.5, -0.1234, 5000)).toBe(`v${CACHE_VERSION}|51.500,-0.123,5000`);
  });

  it('carries the cache version, so bumping it invalidates every existing entry', () => {
    expect(cacheKey(51.5, -0.12, 5000)).toBe(`v${CACHE_VERSION}|51.500,-0.120,5000`);
  });

  it('keeps points either side of a signed zero in the same cell', () => {
    // ~22 m apart across the meridian. Both round to 0.000, so this must be one
    // key: toFixed alone would give "-0.000" and "0.000" and miss every time.
    expect(cacheKey(51.5, -0.0001, 5000)).toBe(cacheKey(51.5, 0.0001, 5000));
  });

  it('never emits a negative zero in either coordinate', () => {
    expect(cacheKey(-0.0001, -0.0001, 5000)).toBe(`v${CACHE_VERSION}|0.000,0.000,5000`);
  });

  it('does not confuse the two coordinates for each other', () => {
    // Same numbers, swapped: must not collide.
    expect(cacheKey(1.234, 5.678, 5000)).not.toBe(cacheKey(5.678, 1.234, 5000));
  });

  it('rounds a fractional distance to whole metres', () => {
    expect(cacheKey(51.5, -0.12, 5000.4)).toBe(cacheKey(51.5, -0.12, 5000));
  });
});

describe('RouteCache', () => {
  it('returns null for a key it has never seen', () => {
    cache = new RouteCache(':memory:');
    expect(cache.get('missing')).toBeNull();
  });

  it('round-trips a stored route', () => {
    cache = new RouteCache(':memory:');
    const key = cacheKey(51.5, -0.12, 5000);
    cache.put(key, ROUTE);
    expect(cache.get(key)).toEqual(ROUTE);
  });

  it('overwrites an existing key rather than erroring', () => {
    cache = new RouteCache(':memory:');
    const key = cacheKey(51.5, -0.12, 5000);
    cache.put(key, ROUTE);
    const replacement: Route = { distance_m: 9999, turns: [] };
    cache.put(key, replacement);
    expect(cache.get(key)).toEqual(replacement);
  });

  it('keeps entries for different keys independent', () => {
    cache = new RouteCache(':memory:');
    const fiveK = cacheKey(51.5, -0.12, 5000);
    const tenK = cacheKey(51.5, -0.12, 10000);
    cache.put(fiveK, ROUTE);
    cache.put(tenK, { distance_m: 10050, turns: [] });
    expect(cache.get(fiveK)).toEqual(ROUTE);
  });

  it('survives a route with no turns', () => {
    cache = new RouteCache(':memory:');
    const empty: Route = { distance_m: 5000, turns: [] };
    cache.put('k', empty);
    expect(cache.get('k')).toEqual(empty);
  });
});
