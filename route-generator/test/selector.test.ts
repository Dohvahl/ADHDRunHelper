import { describe, expect, it } from 'vitest';
import { isWithinTolerance, select } from '../src/selector.js';
import { Waytype, type Candidate } from '../src/types.js';

/** Waytypes left empty so every candidate scores the same on safety. */
function candidate(distanceM: number): Candidate {
  return { distanceM, geometry: [], steps: [], waytypes: [] };
}

/** A candidate at a given distance with a specific waytype mix. */
function candidateWith(distanceM: number, ...entries: Array<[Waytype, number]>): Candidate {
  return {
    distanceM,
    geometry: [],
    steps: [],
    waytypes: entries.map(([value, distance]) => ({ value, distance, amount: 0 })),
  };
}

describe('isWithinTolerance', () => {
  it('accepts a route from the target up to the allowance', () => {
    expect(isWithinTolerance(candidate(5000), 5000)).toBe(true);
    expect(isWithinTolerance(candidate(5400), 5000)).toBe(true);
    expect(isWithinTolerance(candidate(5500), 5000)).toBe(true); // exactly +10%
  });

  it('rejects anything longer than the allowance', () => {
    expect(isWithinTolerance(candidate(5501), 5000)).toBe(false);
    // The real case that started this: a 5668m "5k" running 74% along arterials.
    expect(isWithinTolerance(candidate(5668), 5000)).toBe(false);
    expect(isWithinTolerance(candidate(10129), 5000)).toBe(false);
  });

  it('rejects short routes by default, however close', () => {
    // A short run is a failed run: finishing a "5k" at 4.999km is still not a 5k.
    expect(isWithinTolerance(candidate(4999), 5000)).toBe(false);
    expect(isWithinTolerance(candidate(4600), 5000)).toBe(false);
  });

  it('accepts short routes within the allowance when the runner opts in', () => {
    expect(isWithinTolerance(candidate(4600), 5000, true)).toBe(true);
    expect(isWithinTolerance(candidate(4500), 5000, true)).toBe(true); // exactly -10%
    expect(isWithinTolerance(candidate(4499), 5000, true)).toBe(false);
  });

  it('still rejects over-long routes when short ones are allowed', () => {
    // allowShorter opens the lower side only.
    expect(isWithinTolerance(candidate(5501), 5000, true)).toBe(false);
  });

  it('scales the allowance with the target', () => {
    expect(isWithinTolerance(candidate(11000), 10000)).toBe(true);
    expect(isWithinTolerance(candidate(1100), 1000)).toBe(true);
    expect(isWithinTolerance(candidate(1200), 1000)).toBe(false);
  });
});

describe('select', () => {
  it('throws when there are no candidates', () => {
    expect(() => select([], 5000)).toThrow('no candidates');
  });

  it('prefers a meaningfully safer candidate', () => {
    // A whole-route difference between arterial and sidewalk is far more than one
    // safety bucket, so it outranks distance.
    const arterial = candidateWith(5000, [Waytype.ROAD, 5000]);
    const sidewalks = candidateWith(5200, [Waytype.FOOTWAY, 5200]);
    expect(select([arterial, sidewalks], 5000)).toBe(sidewalks);
  });

  it('reaches the target rather than getting closer to it', () => {
    // 4900 is nearer to 5000 than 5150 is, but a "5k" that finishes at 4.9km is the
    // failure a runner actually notices. The extra is cooldown.
    const under = candidateWith(4900, [Waytype.FOOTWAY, 4900]);
    const over = candidateWith(5150, [Waytype.FOOTWAY, 5150]);
    expect(select([under, over], 5000)).toBe(over);
  });

  it('treats hitting the target exactly as reaching it', () => {
    const exact = candidateWith(5000, [Waytype.FOOTWAY, 5000]);
    const under = candidateWith(4990, [Waytype.FOOTWAY, 4990]);
    expect(select([under, exact], 5000)).toBe(exact);
  });

  it('takes the smallest overshoot among candidates that all reach the target', () => {
    const far = candidateWith(5400, [Waytype.FOOTWAY, 5400]);
    const near = candidateWith(5050, [Waytype.FOOTWAY, 5050]);
    expect(select([far, near], 5000)).toBe(near);
  });

  it('takes the closest undershoot when nothing reaches the target', () => {
    const short = candidateWith(4600, [Waytype.FOOTWAY, 4600]);
    const nearlyThere = candidateWith(4950, [Waytype.FOOTWAY, 4950]);
    expect(select([short, nearlyThere], 5000)).toBe(nearlyThere);
  });

  it('does not let a trivially safer route drag the run short', () => {
    // Same safety bucket: a 0.02 score difference must not outrank reaching 5k.
    const under = candidateWith(4800, [Waytype.FOOTWAY, 4800]);
    const over = candidateWith(5100, [Waytype.FOOTWAY, 5049], [Waytype.ROAD, 51]);
    expect(select([under, over], 5000)).toBe(over);
  });

  it('does not mutate the caller’s array', () => {
    const first = candidateWith(5200, [Waytype.ROAD, 5200]);
    const second = candidateWith(5000, [Waytype.FOOTWAY, 5000]);
    const candidates = [first, second];
    select(candidates, 5000);
    expect(candidates[0]).toBe(first);
    expect(candidates[1]).toBe(second);
  });

  it('reproduces the real survey: picks the safe 4787m over the arterial 5000m', () => {
    // From an actual run: seed 0 was 23% road / 43% cycleway, seed 2 was 74% road.
    // Seed 2 reaches the target and seed 0 does not, but the safety gap is many
    // buckets wide — this is the case where safety is meant to win.
    const seed0 = candidateWith(4787, [Waytype.ROAD, 1100], [Waytype.CYCLEWAY, 2059], [Waytype.STREET, 1628]);
    const seed2 = candidateWith(5000, [Waytype.ROAD, 3700], [Waytype.CYCLEWAY, 650], [Waytype.STREET, 650]);
    expect(select([seed0, seed2], 5000)).toBe(seed0);
  });
});
