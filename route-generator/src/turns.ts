import type { Candidate, Coord, Dir, OrsStep, Turn } from './types.js';

/** Planar approximation in degrees (0 = north, increasing clockwise). */
export function bearing(from: Coord, to: Coord): number {
  // find components of the vector between the two points
  const deltaX = to[0] - from[0];
  const deltaY = to[1] - from[1];

  // calculate the angle in radians and convert to degrees
  const angleRad = Math.atan2(deltaX, deltaY);
  let angleDeg = (angleRad * 180) / Math.PI;

  // normalize to [0, 360)
  if (angleDeg < 0) {
    angleDeg += 360;
  }

  return angleDeg;
}

/** Signed change in bearing, normalised to (-180, 180]. Positive = right, negative = left. */
export function turnAngle(incoming: number, outgoing: number): number {
  let delta = outgoing - incoming;
  if (delta > 180) {
    delta -= 360;
  } else if (delta <= -180) {
    delta += 360;
  }
  return delta;
}

/**
 * Net direction across a maneuver spanning several geometry points (a roundabout):
 * compare the bearing going in against the bearing coming out.
 * Null when the geometry lacks the points needed to judge, or the net turn is zero.
 */
export function netDirection(geometry: Coord[], step: OrsStep): Dir | null {
  const [startIdx, endIdx] = step.way_points;
  if (startIdx < 1 || endIdx >= geometry.length - 1 || startIdx >= endIdx) {
    return null; // invalid indices
  }

  const incomingBearing = bearing(geometry[startIdx - 1], geometry[startIdx]);
  const outgoingBearing = bearing(geometry[endIdx], geometry[endIdx + 1]);
  const angle = turnAngle(incomingBearing, outgoingBearing);

  if (angle > 0) {
    return 'right';
  } else if (angle < 0) {
    return 'left';
  } else {
    return null; // no net turn
  }
}

/** Every point where the runner must actually turn. Straights produce nothing. */
export function extractTurns(candidate: Candidate): Turn[] {
  const turns: Turn[] = [];
  candidate.steps.forEach((step) => {
    const turnPointIdx = step.way_points[0];
    if (turnPointIdx < 0 || turnPointIdx >= candidate.geometry.length) {
      return; // invalid index
    }

    const turnPoint = candidate.geometry[turnPointIdx];
    if (step.type >= 0 && step.type < 6) {
      turns.push({ lat: turnPoint[1], lng: turnPoint[0], dir: step.type % 2 === 0 ? 'left' : 'right' });
    } else if (step.type === 7) {
      const dir = netDirection(candidate.geometry, step);
      if (dir) {
        turns.push({ lng: turnPoint[0], lat: turnPoint[1], dir: dir });
      }
    }
  });
  return turns;
}
