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
  UNKNOWN = 0,

  STATE_ROAD,
  ROAD,
  STREET,
  PATH,
  TRACK,
  CYCLEWAY,
  FOOTWAY,
  STEPS,
  FERRY,
  CONSTRUCTION,
}

export const EXCLUDED_WAYTYPES: ReadonlySet<Waytype> = new Set([Waytype.STATE_ROAD]);
export const PREFERRED_WAYTYPES: ReadonlySet<Waytype> = new Set([
  Waytype.STREET,
  Waytype.PATH,
  Waytype.CYCLEWAY,
  Waytype.FOOTWAY,
]);
export const PENALISED_WAYTYPES: ReadonlySet<Waytype> = new Set([Waytype.ROAD]);
export const NEUTRAL_WAYTYPES: ReadonlySet<Waytype> = new Set([
  Waytype.TRACK,
  Waytype.STEPS,
  Waytype.FERRY,
  Waytype.CONSTRUCTION,
]);

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
