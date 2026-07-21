import { describe, expect, it } from 'vitest';
import { Waytype } from '../src/types.js';

/**
 * Pins our enum to ORS's documented waytype ids.
 *
 * The numbers on the right are transcribed from the ORS docs, NOT derived from the
 * enum — that independence is the entire point. Every other test in the suite refers
 * to waytypes symbolically (Waytype.FOOTWAY), which means a wrong constant would be
 * wrong on both sides of those assertions and still pass. This file is the only
 * place that can notice our constants drifting from the API.
 *
 * Source: https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/extra-info/waytype
 */
describe('Waytype ids match the ORS API', () => {
  it.each<[string, Waytype, number]>([
    ['Unknown', Waytype.UNKNOWN, 0],
    ['State Road', Waytype.STATE_ROAD, 1],
    ['Road', Waytype.ROAD, 2],
    ['Street', Waytype.STREET, 3],
    ['Path', Waytype.PATH, 4],
    ['Track', Waytype.TRACK, 5],
    ['Cycleway', Waytype.CYCLEWAY, 6],
    ['Footway', Waytype.FOOTWAY, 7],
    ['Steps', Waytype.STEPS, 8],
    ['Ferry', Waytype.FERRY, 9],
    ['Construction', Waytype.CONSTRUCTION, 10],
  ])('%s is %i', (_label, actual, expected) => {
    expect(actual).toBe(expected);
  });

  it('uses plain sequential ids, not bit flags', () => {
    // The trap this guards: ORS's `waycategory` IS a bitfield (1, 2, 4, 8, 16,
    // combinable), but `waytype` is not. Modelling waytype as bit flags shifts every
    // id, and the first casualty is State Road — which silently stops being rejected,
    // putting the runner back on trunk roads with a green test suite.
    expect(Waytype.STATE_ROAD).toBe(1);
    expect(Waytype.STEPS).not.toBe(1 << 8);
  });
});
