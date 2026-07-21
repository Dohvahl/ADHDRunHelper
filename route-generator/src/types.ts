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

/** Waytypes - from ORS documentation */
export enum Waytype {
  STATE_ROAD = 1 << 1,
  ROAD = 1 << 2,
  STREET = 1 << 3,
  PATH = 1 << 4,
  TRACK = 1 << 5,
  CYCLEWAY = 1 << 6,
  FOOTWAY = 1 << 7,
  STEPS = 1 << 8,

  COUNT,

  INVALID = -1,

  EXCLUDED = STATE_ROAD, // ORS will never route on these
  PREFERRED = STREET | PATH | CYCLEWAY | FOOTWAY, // the ideal waytypes for a running route
  PENALISED = ROAD, // not ideal, but not forbidden
  NEUTRAL = TRACK | STEPS,
}

/**
 * One entry of ORS's waytype summary: how much of the route ran on this class of
 * way. The ids map onto OSM `highway=*`:
 *   1 State Road (primary/motorway/trunk) · 2 Road (secondary/tertiary/unclassified)
 *   3 Street (residential/living_street/service) · 4 Path · 5 Track
 *   6 Cycleway · 7 Footway (footway/pedestrian/crossing) · 8 Steps
 */
export interface WaytypeSummary {
  value: number;
  /** Metres of the route on this way class. */
  distance: number;
  /** Percentage of the route on this way class. */
  amount: Waytype | number;
}

/** One ORS round_trip result under consideration. */
export interface Candidate {
  distanceM: number;
  geometry: Coord[];
  steps: OrsStep[];
  /** Empty when ORS returned no waytype extras — treated as unverifiable, so unsafe. */
  waytypes: WaytypeSummary[];
}
