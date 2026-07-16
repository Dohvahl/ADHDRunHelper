export type Dir = 'left' | 'right';

/** A single cue point on the route. */
export interface Turn {
  lat: number;
  lng: number;
  dir: Dir;
}

/** The wire contract returned by GET /route. */
export interface Route {
  distance_m: number;
  turns: Turn[];
}

/** ORS coordinate order is [lng, lat] — NOT [lat, lng]. */
export type Coord = [number, number];

/** One ORS maneuver. `way_points` are [startIdx, endIdx] into the route geometry. */
export interface OrsStep {
  type: number;
  way_points: [number, number];
}

/** One ORS round_trip result under consideration. */
export interface Candidate {
  distanceM: number;
  geometry: Coord[];
  steps: OrsStep[];
}
