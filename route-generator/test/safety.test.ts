import { describe, expect, it } from 'vitest';
import { isSafe, safetyScore } from '../src/safety.js';
import { Candidate, Waytype, WaytypeSummary } from '../src/types.js';

/** Only the waytype mix matters here; distance/geometry/steps are irrelevant. */
function withWaytypes(...entries: Array<[value: Waytype, distance: number]>): Candidate {
  const waytypes: WaytypeSummary[] = entries.map(([value, distance]) => ({
    value,
    distance,
    amount: 0, // percentage is unused by the safety rules; distance is what counts
  }));
  return { distanceM: 5000, geometry: [], steps: [], waytypes };
}

describe('isSafe', () => {
  it('rejects any route that touches a State Road', () => {
    // This is the whole point: trunk/primary/motorway is never acceptable on foot,
    // no matter how little of it there is or how good the rest of the route looks.
    expect(isSafe(withWaytypes([Waytype.FOOTWAY, 4900], [Waytype.STATE_ROAD, 100]))).toBe(false);
  });

  it('accepts a route made only of footway and residential street', () => {
    expect(isSafe(withWaytypes([Waytype.FOOTWAY, 3000], [Waytype.STREET, 2000]))).toBe(true);
  });

  it('accepts a route containing penalised Road segments', () => {
    // waytype 2 lumps nasty secondary roads in with harmless unclassified ones, so
    // it is penalised in scoring, NOT rejected — rejecting it would starve the pool.
    expect(isSafe(withWaytypes([Waytype.STREET, 4000], [Waytype.ROAD, 1000]))).toBe(true);
  });

  it('rejects a candidate with no waytype data at all', () => {
    // Fail closed: we asked ORS for the extras, so their absence means we cannot
    // verify the route. Refuse rather than guess.
    expect(isSafe(withWaytypes())).toBe(false);
  });
});

describe('safetyScore', () => {
  it('scores an all-preferred route at 1', () => {
    expect(
      safetyScore(withWaytypes([Waytype.FOOTWAY, 3000], [Waytype.STREET, 1000], [Waytype.PATH, 1000])),
    ).toBeCloseTo(1);
  });

  it('scores an all-penalised route at -1', () => {
    expect(safetyScore(withWaytypes([Waytype.ROAD, 5000]))).toBeCloseTo(-1);
  });

  it('nets preferred against penalised distance', () => {
    // 3000 preferred - 1000 penalised, over 4000 total.
    expect(safetyScore(withWaytypes([Waytype.FOOTWAY, 3000], [Waytype.ROAD, 1000]))).toBeCloseTo(0.5);
  });

  it('scores an even split at 0', () => {
    expect(safetyScore(withWaytypes([Waytype.FOOTWAY, 2000], [Waytype.ROAD, 2000]))).toBeCloseTo(0);
  });

  it('treats track and steps as neither preferred nor penalised', () => {
    expect(safetyScore(withWaytypes([Waytype.TRACK, 3000], [Waytype.STEPS, 1000]))).toBeCloseTo(0);
  });

  it('counts cycleway as preferred', () => {
    expect(safetyScore(withWaytypes([Waytype.CYCLEWAY, 5000]))).toBeCloseTo(1);
  });

  it('returns 0 rather than dividing by zero when there is no waytype data', () => {
    expect(safetyScore(withWaytypes())).toBe(0);
  });

  it('ranks a mostly-footway route above a mostly-road one', () => {
    const sidewalks = withWaytypes([Waytype.FOOTWAY, 4000], [Waytype.ROAD, 1000]);
    const arterials = withWaytypes([Waytype.FOOTWAY, 1000], [Waytype.ROAD, 4000]);
    expect(safetyScore(sidewalks)).toBeGreaterThan(safetyScore(arterials));
  });
});
