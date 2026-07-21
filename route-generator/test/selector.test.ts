import { describe, expect, it } from 'vitest';
import { isGoodEnough, select } from '../src/selector.js';
import type { Candidate } from '../src/types.js';

/**
 * Only distanceM matters to most of these; geometry/steps are irrelevant. Waytypes
 * are left empty so every candidate scores the same on safety — that keeps the
 * distance rules under test here, and the safety tiebreak isolated to its own case.
 */
function candidate(distanceM: number): Candidate {
  return { distanceM, geometry: [], steps: [], waytypes: [] };
}

describe('isGoodEnough', () => {
  it('accepts a candidate within 100m either side of target', () => {
    expect(isGoodEnough(candidate(5000), 5000)).toBe(true);
    expect(isGoodEnough(candidate(5100), 5000)).toBe(true);
    expect(isGoodEnough(candidate(4900), 5000)).toBe(true);
  });

  it('rejects a candidate more than 100m from target', () => {
    expect(isGoodEnough(candidate(5101), 5000)).toBe(false);
    expect(isGoodEnough(candidate(4899), 5000)).toBe(false);
  });
});

describe('select', () => {
  it('takes a good-enough candidate even if another overshoots more tightly', () => {
    const good = candidate(4950);
    const chosen = select([candidate(6000), good, candidate(5500)], 5000);
    expect(chosen).toBe(good);
  });

  it('prefers the smallest overshoot when nothing is good enough', () => {
    const chosen = select([candidate(7000), candidate(5500), candidate(6000)], 5000);
    expect(chosen.distanceM).toBe(5500);
  });

  it('falls back to the closest when every candidate undershoots', () => {
    const chosen = select([candidate(3000), candidate(4500), candidate(4000)], 5000);
    expect(chosen.distanceM).toBe(4500);
  });

  it('throws when there are no candidates', () => {
    expect(() => select([], 5000)).toThrow('no candidates');
  });

  it('returns the first good-enough candidate when several qualify', () => {
    const first = candidate(4950);
    expect(select([first, candidate(5050)], 5000)).toBe(first);
  });

  it('keeps the first candidate when two overshoots tie', () => {
    const first = candidate(5500);
    expect(select([first, candidate(5500)], 5000)).toBe(first);
  });

  it('keeps the first candidate when two undershoots tie on closeness', () => {
    const first = candidate(4000);
    expect(select([first, candidate(4000)], 5000)).toBe(first);
  });
});
