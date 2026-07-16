import { describe, expect, it } from 'vitest';
import { bearing, extractTurns, netDirection, turnAngle } from '../src/turns.js';
import type { Candidate, Coord, OrsStep } from '../src/types.js';

// ORS instruction type codes, per its API docs. Spelled out as literals here rather
// than imported from the source, so these tests check the mapping independently of it.
const LEFT = 0;
const RIGHT = 1;
const SHARP_LEFT = 2;
const SHARP_RIGHT = 3;
const SLIGHT_LEFT = 4;
const SLIGHT_RIGHT = 5;
const STRAIGHT = 6;
const ROUNDABOUT_ENTER = 7;
const ROUNDABOUT_EXIT = 8;
const UTURN = 9;
const GOAL = 10;
const DEPART = 11;
const KEEP_LEFT = 12;
const KEEP_RIGHT = 13;

function candidate(geometry: Coord[], steps: OrsStep[]): Candidate {
  return { distanceM: 1000, geometry, steps };
}

/**
 * A dead straight line heading east. Used for the typed-turn cases on purpose: for
 * types 0-5 ORS has already decided the direction and we must NOT second-guess it
 * from the geometry (ORS knows the road layout; this polyline is decimated).
 * Expecting "left" out of a straight line is the point — it proves the geometry
 * isn't being consulted.
 */
const STRAIGHT_LINE: Coord[] = [
  [0, 0],
  [0.001, 0],
  [0.002, 0],
  [0.003, 0],
];

/**
 * Runs east, turns left, then continues north. A step spanning idx 1->2 enters
 * heading east and leaves heading north: a net LEFT.
 *
 * Two properties matter. It genuinely bends, so any cue derived from the geometry
 * has a real direction to report — that is what makes the no-cue cases below able
 * to fail. And it continues past idx 3, so a maneuver ending there still has a
 * following coordinate; a shorter fixture would let netDirection's index guard
 * mask a cue that should have been rejected on type alone.
 */
const EAST_THEN_NORTH: Coord[] = [
  [0, 0],
  [0.001, 0],
  [0.002, 0],
  [0.002, 0.001],
  [0.002, 0.002],
];

/** Mirror of EAST_THEN_NORTH, leaving south instead: a net RIGHT. */
const EAST_THEN_SOUTH: Coord[] = [
  [0, 0],
  [0.001, 0],
  [0.002, 0],
  [0.002, -0.001],
  [0.002, -0.002],
];

describe('bearing', () => {
  it('reads ~90° going east and ~0° going north', () => {
    expect(bearing([0, 0], [0.001, 0])).toBeCloseTo(90, 1);
    expect(bearing([0, 0], [0, 0.001])).toBeCloseTo(0, 1);
  });
});

describe('turnAngle', () => {
  it('is positive turning right and negative turning left', () => {
    expect(turnAngle(90, 180)).toBe(90);
    expect(turnAngle(90, 0)).toBe(-90);
  });

  it('normalises across the 0/360 wrap', () => {
    expect(turnAngle(350, 10)).toBe(20);
    expect(turnAngle(10, 350)).toBe(-20);
  });
});

describe('extractTurns: direction comes from the ORS type', () => {
  it.each<[string, number]>([
    ['Left', LEFT],
    ['Sharp left', SHARP_LEFT],
    ['Slight left', SLIGHT_LEFT],
  ])('cues ORS "%s" as a left turn', (_label, type) => {
    const turns = extractTurns(candidate(STRAIGHT_LINE, [{ type, way_points: [1, 2] }]));
    expect(turns.map((t) => t.dir)).toEqual(['left']);
  });

  it.each<[string, number]>([
    ['Right', RIGHT],
    ['Sharp right', SHARP_RIGHT],
    ['Slight right', SLIGHT_RIGHT],
  ])('cues ORS "%s" as a right turn', (_label, type) => {
    const turns = extractTurns(candidate(STRAIGHT_LINE, [{ type, way_points: [1, 2] }]));
    expect(turns.map((t) => t.dir)).toEqual(['right']);
  });
});

/**
 * These run on a path that BENDS. Only type 7 may consult the geometry, so every
 * type here must stay silent even though the geometry has a left turn sitting right
 * under the maneuver. On a straight fixture these would pass whether or not the code
 * checks the type — the bend is what gives them teeth.
 */
describe('extractTurns: types that must never cue, even over a bend', () => {
  it.each<[string, number]>([
    ['Straight', STRAIGHT],
    ['Roundabout exit', ROUNDABOUT_EXIT],
    ['U-turn', UTURN],
    ['Goal', GOAL],
    ['Depart', DEPART],
    ['Keep left', KEEP_LEFT],
    ['Keep right', KEEP_RIGHT],
  ])('emits no cue for ORS "%s"', (_label, type) => {
    expect(extractTurns(candidate(EAST_THEN_NORTH, [{ type, way_points: [1, 2] }]))).toEqual([]);
  });
});

describe('extractTurns: where the cue is placed', () => {
  it('places the cue at the coordinate way_points[0] points to', () => {
    const turns = extractTurns(candidate(STRAIGHT_LINE, [{ type: LEFT, way_points: [2, 3] }]));
    expect(turns).toEqual([{ lat: 0, lng: 0.002, dir: 'left' }]);
  });

  it('skips a step whose maneuver index is missing from the geometry', () => {
    expect(extractTurns(candidate(STRAIGHT_LINE, [{ type: LEFT, way_points: [99, 100] }]))).toEqual([]);
  });

  it('returns an empty list for a route with no steps', () => {
    expect(extractTurns(candidate(STRAIGHT_LINE, []))).toEqual([]);
  });
});

/** Roundabouts are the one case where the type carries no direction, so geometry decides. */
describe('extractTurns: roundabout direction comes from the geometry', () => {
  it('cues a net-left roundabout as left', () => {
    const steps: OrsStep[] = [{ type: ROUNDABOUT_ENTER, way_points: [1, 2] }];
    const turns = extractTurns(candidate(EAST_THEN_NORTH, steps));
    expect(turns).toEqual([{ lat: 0, lng: 0.001, dir: 'left' }]);
  });

  it('cues a net-right roundabout as right', () => {
    const steps: OrsStep[] = [{ type: ROUNDABOUT_ENTER, way_points: [1, 2] }];
    const turns = extractTurns(candidate(EAST_THEN_SOUTH, steps));
    expect(turns).toEqual([{ lat: 0, lng: 0.001, dir: 'right' }]);
  });

  it('emits one cue per roundabout: the exit step is ignored so you are not vibrated twice', () => {
    const steps: OrsStep[] = [
      { type: ROUNDABOUT_ENTER, way_points: [1, 2] },
      { type: ROUNDABOUT_EXIT, way_points: [2, 3] },
    ];
    const turns = extractTurns(candidate(EAST_THEN_NORTH, steps));
    expect(turns).toEqual([{ lat: 0, lng: 0.001, dir: 'left' }]);
  });
});

describe('netDirection', () => {
  it('returns null when there is no coordinate after the maneuver to judge with', () => {
    const step: OrsStep = { type: ROUNDABOUT_ENTER, way_points: [1, 4] };
    expect(netDirection(EAST_THEN_NORTH, step)).toBeNull();
  });
});
