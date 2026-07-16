# Route Generator Implementation Plan

> **How this plan is executed:** Ty implements each task by hand, TDD-style, against the tests provided here. Tests, scaffolding, and type/constant declarations are given complete. **Implementation bodies are deliberately left as signatures + rules** so they get written rather than transcribed. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `route-generator/` — an HTTP service that turns *(start location, target distance)* into a loop running route, returned as a turns-only contract and cached so repeats don't re-hit the routing provider.

**Architecture:** A thin proxy over hosted OpenRouteService (ORS). The provider-specific and I/O parts (`ors-client`, `cache`) stay dumb; every real decision lives in small pure functions (`selector`, `turns`) that are cheap to unit-test. `generator` orchestrates: call ORS up to 4× with fixed seeds, short-circuit on a good-enough candidate, pick a winner, extract turns. `server` is a Fastify wrapper doing validation + cache lookup.

**Tech Stack:** TypeScript, Node ≥ 20, Fastify, Zod, better-sqlite3, Vitest.

**Spec:** [`docs/superpowers/specs/2026-07-15-route-generation-backend-design.md`](../specs/2026-07-15-route-generation-backend-design.md)

## Global Constraints

- **Node ≥ 20** — relies on global `fetch`; no `node-fetch` dependency.
- **ESM**: `"type": "module"`, TypeScript `module`/`moduleResolution` = `NodeNext`. Every relative import MUST carry a `.js` extension (e.g. `import { select } from './selector.js'`) even though the source files are `.ts`. Omitting it is the most likely source of a confusing runtime failure.
- **TypeScript `strict: true`.**
- **Meters are canonical.** The endpoint is unit-agnostic; callers convert km/mi. Never introduce unit handling here.
- **Constants (exact values):** `CANDIDATE_SEEDS = [0, 1, 2, 3]` (N=4), `EARLY_OUT_M = 100`, `ROUND_DECIMALS = 3`, `MAX_DISTANCE_M = 100_000`, ORS profile `foot-walking`, `ROUND_TRIP_POINTS = 3`.
- **`ORS_API_KEY` comes from the environment.** Never commit a real key. `.env` is already gitignored repo-wide.
- **No network in the test suite.** ORS is always injected/mocked. The one live test is env-gated and opt-in.
- **Comments state constraints and *why*** — not what the next line does.
- All commands run from `route-generator/`.

---

### Task 1: Project scaffold + shared types + config + `selector`

Scaffold is folded in here because `selector` is the first deliverable that needs it. Ends with a green test run.

**Files:**
- Create: `route-generator/package.json`, `tsconfig.json`, `.env.example`
- Create: `route-generator/src/types.ts`, `src/config.ts`
- Create: `route-generator/src/selector.ts` ← **your implementation**
- Test: `route-generator/test/selector.test.ts`

**Interfaces produced:**
- `types.ts`: `Dir`, `Turn`, `Route`, `Coord`, `OrsStep`, `Candidate`
- `config.ts`: `ORS_BASE_URL`, `ORS_PROFILE`, `CANDIDATE_SEEDS`, `EARLY_OUT_M`, `ROUND_DECIMALS`, `MAX_DISTANCE_M`, `ROUND_TRIP_POINTS`, `orsApiKey(): string`
- `selector.ts`: `isGoodEnough(candidate: Candidate, targetM: number): boolean`; `select(candidates: Candidate[], targetM: number): Candidate`

- [ ] **Step 1: Create the scaffold** (boilerplate — take as-is)

`route-generator/package.json`:
```json
{
  "name": "route-generator",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "fastify": "^4.28.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.5.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.2",
    "vitest": "^2.1.1"
  }
}
```

`route-generator/tsconfig.json` — no emit: dev runs through `tsx` and hosting is
still deferred, so `tsc` is purely a typechecker. `test` is in `include` so the
editor typechecks the tests too.
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "test"]
}
```

`route-generator/.env.example`:
```
# Free key from https://openrouteservice.org — copy to .env (gitignored)
ORS_API_KEY=
```

Run: `cd route-generator && npm install`

- [ ] **Step 2: Add types and config** (declarations — take as-is)

`route-generator/src/types.ts`:
```ts
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
```

`route-generator/src/config.ts`:
```ts
export const ORS_BASE_URL = 'https://api.openrouteservice.org';
export const ORS_PROFILE = 'foot-walking';

/** Fixed seeds keep generation deterministic and reproducible across runs. */
export const CANDIDATE_SEEDS = [0, 1, 2, 3];

/** A candidate this close to target is good enough — stop calling ORS. */
export const EARLY_OUT_M = 100;

/** ~110 m cache cells, so the same house rounds to a single key. */
export const ROUND_DECIMALS = 3;

/** ORS's documented round_trip ceiling. */
export const MAX_DISTANCE_M = 100_000;

/** How many waypoints ORS uses to shape the loop. */
export const ROUND_TRIP_POINTS = 3;

export function orsApiKey(): string {
  const key = process.env.ORS_API_KEY;
  if (!key) {
    throw new Error('ORS_API_KEY is not set');
  }
  return key;
}
```

- [ ] **Step 3: Write the failing test** (take as-is)

`route-generator/test/selector.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { isGoodEnough, select } from '../src/selector.js';
import type { Candidate } from '../src/types.js';

/** Only distanceM matters to the selector; geometry/steps are irrelevant here. */
function candidate(distanceM: number): Candidate {
  return { distanceM, geometry: [], steps: [] };
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
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npm test` → FAIL: cannot resolve `../src/selector.js`.

- [ ] **Step 5: Implement `selector.ts`** ← **yours**

Create `route-generator/src/selector.ts` with these signatures. Bodies are yours.

```ts
import { EARLY_OUT_M } from './config.js';
import type { Candidate } from './types.js';

/** Within EARLY_OUT_M of target, either direction — close enough to stop looking. */
export function isGoodEnough(candidate: Candidate, targetM: number): boolean {
  // TODO
}

/**
 * The single authority on which candidate wins:
 *   1. any good-enough candidate, else
 *   2. the smallest overshoot — never leave the run short, else
 *   3. the closest by absolute difference.
 * Throws if given no candidates.
 */
export function select(candidates: Candidate[], targetM: number): Candidate {
  // TODO
}
```

Useful: `Array.prototype.find`, `.filter`, `.reduce`. The throw message must contain `no candidates`.

- [ ] **Step 6: Run to verify it passes**

Run: `npm test` → PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add route-generator/
git commit -m "feat(route-generator): scaffold project + candidate selector"
```

---

### Task 2: `turns` — pure turn extraction

**Files:**
- Create: `route-generator/src/turns.ts` ← **your implementation**
- Test: `route-generator/test/turns.test.ts`

**Interfaces produced:** `bearing(from: Coord, to: Coord): number`; `turnAngle(incoming: number, outgoing: number): number`; `netDirection(geometry: Coord[], step: OrsStep): Dir | null`; `extractTurns(candidate: Candidate): Turn[]`

**ORS instruction types** (the `type` field on a step):
`0` Left · `1` Right · `2` Sharp left · `3` Sharp right · `4` Slight left · `5` Slight right · `6` Straight · `7` Enter roundabout · `8` Exit roundabout · `9` U-turn · `10` Goal · `11` Depart · `12` Keep left · `13` Keep right

**Rules:**
- Cue on 0/2/4 → `left`, 1/3/5 → `right`. Everything else produces no cue.
- Type 7 gets a net-direction cue spanning the roundabout. Type 8 is ignored — the entry step already covers the roundabout, so cueing both would double-vibrate.
- A turn's position is the geometry coordinate at `way_points[0]`. If that index isn't in the geometry, skip the step.

- [ ] **Step 1: Write the failing test** (take as-is)

`route-generator/test/turns.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { bearing, extractTurns, netDirection, turnAngle } from '../src/turns.js';
import type { Candidate, Coord, OrsStep } from '../src/types.js';

/** A tiny L-shaped path: east along the equator, then north. Coords are [lng, lat]. */
const EAST_THEN_NORTH: Coord[] = [
  [0, 0],
  [0.001, 0],
  [0.002, 0],
  [0.002, 0.001],
];

function candidate(geometry: Coord[], steps: OrsStep[]): Candidate {
  return { distanceM: 1000, geometry, steps };
}

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

describe('extractTurns', () => {
  it('maps slight/normal/sharp left types to left', () => {
    for (const type of [0, 2, 4]) {
      const turns = extractTurns(candidate(EAST_THEN_NORTH, [{ type, way_points: [1, 2] }]));
      expect(turns).toEqual([{ lat: 0, lng: 0.001, dir: 'left' }]);
    }
  });

  it('maps slight/normal/sharp right types to right', () => {
    for (const type of [1, 3, 5]) {
      const turns = extractTurns(candidate(EAST_THEN_NORTH, [{ type, way_points: [1, 2] }]));
      expect(turns).toEqual([{ lat: 0, lng: 0.001, dir: 'right' }]);
    }
  });

  it('drops non-turns (straight, u-turn, goal, depart, keep)', () => {
    for (const type of [6, 9, 10, 11, 12, 13]) {
      expect(extractTurns(candidate(EAST_THEN_NORTH, [{ type, way_points: [1, 2] }]))).toEqual([]);
    }
  });

  it('returns an empty list for a route with no steps', () => {
    expect(extractTurns(candidate(EAST_THEN_NORTH, []))).toEqual([]);
  });

  it('cues a roundabout entry by its net direction and ignores the exit', () => {
    // Enter heading east at idx1, leave heading north out of idx2 => net left turn.
    const steps: OrsStep[] = [
      { type: 7, way_points: [1, 2] },
      { type: 8, way_points: [2, 3] },
    ];
    const turns = extractTurns(candidate(EAST_THEN_NORTH, steps));
    expect(turns).toEqual([{ lat: 0, lng: 0.001, dir: 'left' }]);
  });

  it('skips a step whose maneuver index is missing from the geometry', () => {
    const turns = extractTurns(candidate(EAST_THEN_NORTH, [{ type: 0, way_points: [99, 100] }]));
    expect(turns).toEqual([]);
  });
});

describe('netDirection', () => {
  it('returns null when there is no coordinate after the maneuver', () => {
    expect(netDirection(EAST_THEN_NORTH, { type: 7, way_points: [1, 3] })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test` → FAIL: cannot resolve `../src/turns.js`.

- [ ] **Step 3: Implement `turns.ts`** ← **yours**

```ts
import type { Candidate, Coord, Dir, OrsStep, Turn } from './types.js';

/** Compass bearing in degrees (0 = north, increasing clockwise). */
export function bearing(from: Coord, to: Coord): number {
  // TODO
}

/** Signed change in bearing, normalised to (-180, 180]. Positive = right, negative = left. */
export function turnAngle(incoming: number, outgoing: number): number {
  // TODO
}

/**
 * Net direction across a maneuver spanning several geometry points (a roundabout):
 * compare the bearing going in against the bearing coming out.
 * Null when the geometry lacks the points needed to judge, or the net turn is zero.
 */
export function netDirection(geometry: Coord[], step: OrsStep): Dir | null {
  // TODO
}

/** Every point where the runner must actually turn. Straights produce nothing. */
export function extractTurns(candidate: Candidate): Turn[] {
  // TODO
}
```

Hints for the unfamiliar bits:
- **Bearing** (standard great-circle formula), with `lat1`/`lat2`/`dLng` in radians:
  `y = sin(dLng) * cos(lat2)`
  `x = cos(lat1) * sin(lat2) − sin(lat1) * cos(lat2) * cos(dLng)`
  `bearing = (atan2(y, x) in degrees + 360) % 360`
- **turnAngle**: subtract, then add/subtract 360 until it lands in `(-180, 180]`.
- **netDirection**: for `way_points [start, end]`, incoming is `bearing(geometry[start-1], geometry[start])`, outgoing is `bearing(geometry[end], geometry[end+1])`. Any missing point → `null`.
- Remember `Coord` is `[lng, lat]`, so a `Turn` is `{ lat: coord[1], lng: coord[0] }`.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test` → PASS (selector + turns).

- [ ] **Step 5: Commit**

```bash
git add route-generator/src/turns.ts route-generator/test/turns.test.ts
git commit -m "feat(route-generator): extract left/right turns from ORS steps"
```

---

### Task 3: `cache` — SQLite route cache

**Files:**
- Create: `route-generator/src/cache.ts` ← **your implementation**
- Test: `route-generator/test/cache.test.ts`

**Interfaces produced:** `cacheKey(lat: number, lng: number, distanceM: number): string`; `class RouteCache { constructor(filename: string); get(key: string): Route | null; put(key: string, route: Route): void; close(): void }`

**Rules:**
- Key format is exactly `"<lat>,<lng>,<distance>"` with lat/lng at `ROUND_DECIMALS` places and distance rounded to a whole number — e.g. `51.500,-0.123,5000`.
- `put` on an existing key overwrites rather than erroring.

- [ ] **Step 1: Write the failing test** (take as-is)

`route-generator/test/cache.test.ts`:
```ts
import { afterEach, describe, expect, it } from 'vitest';
import { RouteCache, cacheKey } from '../src/cache.js';
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
    // ~11m apart — bedroom vs front step.
    expect(cacheKey(51.50001, -0.12001, 5000)).toBe(cacheKey(51.50004, -0.12004, 5000));
  });

  it('separates points in different cells', () => {
    expect(cacheKey(51.5, -0.12, 5000)).not.toBe(cacheKey(51.6, -0.12, 5000));
  });

  it('separates different distances at the same place', () => {
    expect(cacheKey(51.5, -0.12, 5000)).not.toBe(cacheKey(51.5, -0.12, 10000));
  });

  it('handles negative longitudes', () => {
    expect(cacheKey(51.5, -0.1234, 5000)).toBe('51.500,-0.123,5000');
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
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test` → FAIL: cannot resolve `../src/cache.js`.

- [ ] **Step 3: Implement `cache.ts`** ← **yours**

```ts
import Database from 'better-sqlite3';
import { ROUND_DECIMALS } from './config.js';
import type { Route } from './types.js';

/**
 * Rounding lat/lng to ~110 m means the same house always produces one key, so
 * asking for a 5k three times from your kitchen hits ORS once.
 * Known rough edge: any grid has boundary effects — two points metres apart can
 * straddle a cell edge.
 */
export function cacheKey(lat: number, lng: number, distanceM: number): string {
  // TODO
}

export class RouteCache {
  private readonly db: Database.Database;

  constructor(filename: string) {
    // TODO: open the database and ensure the table exists.
  }

  get(key: string): Route | null {
    // TODO
  }

  put(key: string, route: Route): void {
    // TODO
  }

  close(): void {
    // TODO
  }
}
```

Hints for the unfamiliar bits (better-sqlite3 is synchronous — no `await` anywhere):
- Open: `new Database(filename)`. `':memory:'` gives a throwaway DB, which is what the tests use.
- Schema: `this.db.exec('CREATE TABLE IF NOT EXISTS routes (key TEXT PRIMARY KEY, route TEXT NOT NULL)')`
- Read: `this.db.prepare('SELECT route FROM routes WHERE key = ?').get(key)` returns the row or `undefined`. It's typed `unknown`, so cast: `as { route: string } | undefined`.
- Write: `INSERT OR REPLACE INTO routes (key, route) VALUES (?, ?)` with `.run(...)` — `OR REPLACE` is what gives you the overwrite behaviour for free.
- Routes are stored as JSON text (`JSON.stringify` / `JSON.parse`).
- `Number.prototype.toFixed(ROUND_DECIMALS)` does the rounding and the string formatting in one go.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test` → PASS (three suites).

- [ ] **Step 5: Commit**

```bash
git add route-generator/src/cache.ts route-generator/test/cache.test.ts
git commit -m "feat(route-generator): add SQLite route cache keyed by rounded location"
```

---

### Task 4: `ors-client` — the ORS round_trip wrapper

The only module that knows ORS's HTTP shape or the API key. We request GeoJSON so geometry arrives as plain coordinates — no polyline decoder needed.

**Files:**
- Create: `route-generator/src/ors-client.ts` ← **your implementation**
- Test: `route-generator/test/ors-client.test.ts`

**Interfaces produced:** `class OrsError extends Error`; `fetchRoundTrip(lat: number, lng: number, lengthM: number, seed: number): Promise<Candidate | null>`

**Rules:**
- `POST {ORS_BASE_URL}/v2/directions/{ORS_PROFILE}/geojson`, `Authorization: <key>`, `Content-Type: application/json`.
- Body: `{ coordinates: [[lng, lat]], options: { round_trip: { length, points, seed } }, instructions: true }`. round_trip takes **exactly one** coordinate — the start.
- Non-`ok` response → throw `OrsError` (message must include the status).
- No features in the response → resolve `null` (ORS answered fine; no loop for this seed). This distinction matters: `null` means "try another seed", a throw means "ORS is broken".

**Response shape to parse:**
```
features[0].geometry.coordinates              -> Coord[]
features[0].properties.summary.distance       -> distanceM
features[0].properties.segments[].steps       -> flatten to OrsStep[]
```

- [ ] **Step 1: Write the failing test** (take as-is)

`route-generator/test/ors-client.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrsError, fetchRoundTrip } from '../src/ors-client.js';

/** Minimal but structurally real ORS GeoJSON directions response. */
const ORS_RESPONSE = {
  features: [
    {
      geometry: {
        type: 'LineString',
        coordinates: [
          [-0.12, 51.5],
          [-0.119, 51.5],
          [-0.119, 51.501],
        ],
      },
      properties: {
        summary: { distance: 5012.3, duration: 3600 },
        segments: [
          {
            steps: [
              { type: 11, way_points: [0, 1] },
              { type: 0, way_points: [1, 2] },
            ],
          },
        ],
      },
    },
  ],
};

beforeEach(() => {
  process.env.ORS_API_KEY = 'test-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ORS_API_KEY;
});

function stubFetch(response: unknown, ok = true, status = 200): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue({ ok, status, json: async () => response });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('fetchRoundTrip', () => {
  it('posts the round_trip request ORS expects', async () => {
    const fetchMock = stubFetch(ORS_RESPONSE);
    await fetchRoundTrip(51.5, -0.12, 5000, 2);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openrouteservice.org/v2/directions/foot-walking/geojson');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('test-key');

    const body = JSON.parse(init.body);
    expect(body.coordinates).toEqual([[-0.12, 51.5]]);
    expect(body.options.round_trip).toEqual({ length: 5000, points: 3, seed: 2 });
  });

  it('parses distance, geometry and flattened steps into a Candidate', async () => {
    stubFetch(ORS_RESPONSE);
    const candidate = await fetchRoundTrip(51.5, -0.12, 5000, 0);

    expect(candidate).not.toBeNull();
    expect(candidate!.distanceM).toBe(5012.3);
    expect(candidate!.geometry).toHaveLength(3);
    expect(candidate!.geometry[0]).toEqual([-0.12, 51.5]);
    expect(candidate!.steps).toEqual([
      { type: 11, way_points: [0, 1] },
      { type: 0, way_points: [1, 2] },
    ]);
  });

  it('resolves null when ORS returns no features', async () => {
    stubFetch({ features: [] });
    expect(await fetchRoundTrip(51.5, -0.12, 5000, 0)).toBeNull();
  });

  it('throws OrsError on an HTTP failure', async () => {
    stubFetch({ error: 'rate limited' }, false, 429);
    await expect(fetchRoundTrip(51.5, -0.12, 5000, 0)).rejects.toThrow(OrsError);
  });

  it('throws when the API key is missing', async () => {
    delete process.env.ORS_API_KEY;
    stubFetch(ORS_RESPONSE);
    await expect(fetchRoundTrip(51.5, -0.12, 5000, 0)).rejects.toThrow('ORS_API_KEY is not set');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test` → FAIL: cannot resolve `../src/ors-client.js`.

- [ ] **Step 3: Implement `ors-client.ts`** ← **yours**

```ts
import { ORS_BASE_URL, ORS_PROFILE, ROUND_TRIP_POINTS, orsApiKey } from './config.js';
import type { Candidate, Coord, OrsStep } from './types.js';

/** ORS said no (network, rate limit, bad request) — distinct from "no route exists". */
export class OrsError extends Error {}

interface OrsGeoJson {
  features?: Array<{
    geometry: { coordinates: Coord[] };
    properties: {
      summary: { distance: number };
      segments: Array<{ steps: OrsStep[] }>;
    };
  }>;
}

/** One ORS round_trip attempt. Null when ORS simply couldn't find a loop for this seed. */
export async function fetchRoundTrip(
  lat: number,
  lng: number,
  lengthM: number,
  seed: number,
): Promise<Candidate | null> {
  // TODO
}
```

Hints: Node 20's global `fetch` needs no import. `response.ok` / `response.status` drive the error path. `Array.prototype.flatMap` flattens `segments[].steps`.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test` → PASS (four suites).

- [ ] **Step 5: Commit**

```bash
git add route-generator/src/ors-client.ts route-generator/test/ors-client.test.ts
git commit -m "feat(route-generator): add ORS round_trip client"
```

---

### Task 5: `generator` — orchestration

**Files:**
- Create: `route-generator/src/generator.ts` ← **your implementation**
- Test: `route-generator/test/generator.test.ts`

**Interfaces produced:** `class NoRouteError extends Error`; `type RoundTripFetcher = (lat: number, lng: number, lengthM: number, seed: number) => Promise<Candidate | null>`; `generateRoute(lat: number, lng: number, targetM: number, fetcher?: RoundTripFetcher): Promise<Route>`

**Rules:**
- Iterate `CANDIDATE_SEEDS` in order, calling `fetcher(lat, lng, targetM, seed)`.
- A `null` candidate is skipped, not fatal — try the next seed.
- Stop early the moment a candidate `isGoodEnough`. This is *only* an optimisation to save ORS calls; `select` still makes the final choice from whatever was collected.
- No candidates at all → throw `NoRouteError`.
- `distance_m` on the returned route is rounded to whole metres.
- `fetcher` defaults to the real `fetchRoundTrip`; tests inject a fake. This default-parameter seam is what keeps the network out of the suite.

- [ ] **Step 1: Write the failing test** (take as-is)

`route-generator/test/generator.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { NoRouteError, generateRoute, type RoundTripFetcher } from '../src/generator.js';
import type { Candidate, Coord } from '../src/types.js';

const GEOMETRY: Coord[] = [
  [0, 0],
  [0.001, 0],
  [0.002, 0],
];

function candidate(distanceM: number): Candidate {
  return { distanceM, geometry: GEOMETRY, steps: [{ type: 0, way_points: [1, 2] }] };
}

/** Serves a scripted distance per seed, so we can assert the early-out. */
function fetcherFor(distancesBySeed: Array<number | null>): RoundTripFetcher {
  return vi.fn(async (_lat, _lng, _lengthM, seed) => {
    const distance = distancesBySeed[seed];
    return distance === null || distance === undefined ? null : candidate(distance);
  });
}

describe('generateRoute', () => {
  it('stops calling ORS as soon as a candidate is good enough', async () => {
    const fetcher = fetcherFor([9000, 5050, 5000, 5000]);
    const route = await generateRoute(51.5, -0.12, 5000, fetcher);

    expect(route.distance_m).toBe(5050);
    // Seeds 0 and 1 only — seed 1 was good enough, so 2 and 3 never ran.
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('tries every seed and picks the smallest overshoot when none is good enough', async () => {
    const fetcher = fetcherFor([9000, 8000, 6000, 3000]);
    const route = await generateRoute(51.5, -0.12, 5000, fetcher);

    expect(route.distance_m).toBe(6000);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('skips seeds that produce no route', async () => {
    const fetcher = fetcherFor([null, null, 8000, 7000]);
    const route = await generateRoute(51.5, -0.12, 5000, fetcher);
    expect(route.distance_m).toBe(7000);
  });

  it('includes the extracted turns in the route', async () => {
    const fetcher = fetcherFor([5000, 5000, 5000, 5000]);
    const route = await generateRoute(51.5, -0.12, 5000, fetcher);
    expect(route.turns).toEqual([{ lat: 0, lng: 0.001, dir: 'left' }]);
  });

  it('rounds the reported distance to whole metres', async () => {
    const fetcher = fetcherFor([5012.7]);
    const route = await generateRoute(51.5, -0.12, 5000, fetcher);
    expect(route.distance_m).toBe(5013);
  });

  it('throws NoRouteError when every seed comes back empty', async () => {
    const fetcher = fetcherFor([null, null, null, null]);
    await expect(generateRoute(51.5, -0.12, 5000, fetcher)).rejects.toThrow(NoRouteError);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test` → FAIL: cannot resolve `../src/generator.js`.

- [ ] **Step 3: Implement `generator.ts`** ← **yours**

```ts
import { CANDIDATE_SEEDS } from './config.js';
import { fetchRoundTrip } from './ors-client.js';
import { isGoodEnough, select } from './selector.js';
import { extractTurns } from './turns.js';
import type { Candidate, Route } from './types.js';

/** ORS answered fine, but no usable loop exists here. */
export class NoRouteError extends Error {}

export type RoundTripFetcher = (
  lat: number,
  lng: number,
  lengthM: number,
  seed: number,
) => Promise<Candidate | null>;

/** Ask ORS for up to CANDIDATE_SEEDS.length loops and return the best one. */
export async function generateRoute(
  lat: number,
  lng: number,
  targetM: number,
  fetcher: RoundTripFetcher = fetchRoundTrip,
): Promise<Route> {
  // TODO
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test` → PASS (five suites).

- [ ] **Step 5: Commit**

```bash
git add route-generator/src/generator.ts route-generator/test/generator.test.ts
git commit -m "feat(route-generator): orchestrate best-of-N route generation"
```

---

### Task 6: `server` — the HTTP endpoint

**Files:**
- Create: `route-generator/src/server.ts` ← **your implementation**
- Create: `route-generator/src/index.ts`
- Create: `route-generator/.gitignore`
- Test: `route-generator/test/server.test.ts`

**Interfaces produced:** `buildServer(opts: { cache: RouteCache; fetcher?: RoundTripFetcher }): FastifyInstance` exposing `GET /route`.

**Rules:**
- Validate `lat` (−90..90), `lng` (−180..180), `distance_m` (positive, ≤ `MAX_DISTANCE_M`). Invalid → **400**. Query params arrive as strings, so coerce before bound-checking.
- Cache hit → return it, no generation.
- Cache miss → generate, store, return.
- `NoRouteError` → **422**. `OrsError` → **502**. Anything else rethrows.
- `buildServer` takes an injected `cache` and optional `fetcher` — that seam is what lets the tests exercise the whole request path with no network and no listening socket.

- [ ] **Step 1: Write the failing test** (take as-is)

`route-generator/test/server.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RouteCache } from '../src/cache.js';
import type { RoundTripFetcher } from '../src/generator.js';
import { OrsError } from '../src/ors-client.js';
import { buildServer } from '../src/server.js';
import type { Candidate, Coord } from '../src/types.js';

const GEOMETRY: Coord[] = [
  [0, 0],
  [0.001, 0],
  [0.002, 0],
];

function candidate(distanceM: number): Candidate {
  return { distanceM, geometry: GEOMETRY, steps: [{ type: 1, way_points: [1, 2] }] };
}

let cache: RouteCache | undefined;

afterEach(() => {
  cache?.close();
  cache = undefined;
});

function serverWith(fetcher: RoundTripFetcher) {
  cache = new RouteCache(':memory:');
  return buildServer({ cache, fetcher });
}

describe('GET /route', () => {
  it('returns a generated route on a cache miss', async () => {
    const app = serverWith(async () => candidate(5000));
    const response = await app.inject({ url: '/route?lat=51.5&lng=-0.12&distance_m=5000' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      distance_m: 5000,
      turns: [{ lat: 0, lng: 0.001, dir: 'right' }],
    });
  });

  it('serves the second identical request from cache without calling ORS again', async () => {
    const fetcher = vi.fn(async () => candidate(5000));
    const app = serverWith(fetcher);

    await app.inject({ url: '/route?lat=51.5&lng=-0.12&distance_m=5000' });
    const second = await app.inject({ url: '/route?lat=51.5&lng=-0.12&distance_m=5000' });

    expect(second.statusCode).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing parameter with 400', async () => {
    const app = serverWith(async () => candidate(5000));
    const response = await app.inject({ url: '/route?lat=51.5&lng=-0.12' });
    expect(response.statusCode).toBe(400);
  });

  it('rejects an out-of-range latitude with 400', async () => {
    const app = serverWith(async () => candidate(5000));
    const response = await app.inject({ url: '/route?lat=99&lng=-0.12&distance_m=5000' });
    expect(response.statusCode).toBe(400);
  });

  it('rejects a distance beyond the ORS round_trip cap with 400', async () => {
    const app = serverWith(async () => candidate(5000));
    const response = await app.inject({ url: '/route?lat=51.5&lng=-0.12&distance_m=100001' });
    expect(response.statusCode).toBe(400);
  });

  it('returns 422 when no route can be generated', async () => {
    const app = serverWith(async () => null);
    const response = await app.inject({ url: '/route?lat=51.5&lng=-0.12&distance_m=5000' });
    expect(response.statusCode).toBe(422);
  });

  it('returns 502 when ORS fails', async () => {
    const app = serverWith(async () => {
      throw new OrsError('ORS request failed with status 429');
    });
    const response = await app.inject({ url: '/route?lat=51.5&lng=-0.12&distance_m=5000' });
    expect(response.statusCode).toBe(502);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test` → FAIL: cannot resolve `../src/server.js`.

- [ ] **Step 3: Implement `server.ts`** ← **yours**

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { RouteCache, cacheKey } from './cache.js';
import { MAX_DISTANCE_M } from './config.js';
import { NoRouteError, generateRoute, type RoundTripFetcher } from './generator.js';
import { OrsError } from './ors-client.js';

export function buildServer(opts: {
  cache: RouteCache;
  fetcher?: RoundTripFetcher;
}): FastifyInstance {
  // TODO
}
```

Hints for the unfamiliar bits:
- Zod: `z.coerce.number()` turns the string `"51.5"` into a number; chain `.min()`/`.max()`/`.positive()`. `schema.safeParse(request.query)` returns `{ success, data | error }` — no exceptions. On failure, `error.issues[0]?.message`.
- Fastify: `const app = Fastify()`, then `app.get('/route', async (request, reply) => …)`. `reply.code(400).send({ error })`; `reply.send(route)` implies 200. `app.inject({ url })` (used by the tests) runs a request without opening a socket.
- `instanceof` is what distinguishes `NoRouteError` (422) from `OrsError` (502).

- [ ] **Step 4: Add the entry point and gitignore** (boilerplate — take as-is)

`route-generator/src/index.ts`:
```ts
import { RouteCache } from './cache.js';
import { buildServer } from './server.js';

const port = Number(process.env.PORT ?? 3000);
const cache = new RouteCache(process.env.CACHE_DB ?? 'routes.db');
const app = buildServer({ cache });

app.listen({ port, host: '0.0.0.0' }).catch((error: unknown) => {
  app.log.error(error);
  process.exit(1);
});
```

`route-generator/.gitignore`:
```
routes.db
dist/
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test` → PASS (all six suites).

- [ ] **Step 6: Commit**

```bash
git add route-generator/src/server.ts route-generator/src/index.ts route-generator/test/server.test.ts route-generator/.gitignore
git commit -m "feat(route-generator): serve GET /route with validation and caching"
```

---

### Task 7: Live smoke test (opt-in)

Every other test mocks ORS. This is the one that answers the question the whole milestone exists to answer: **are ORS's loops actually usable, and how close to target do they land?** Skipped unless `ORS_LIVE_TEST=1`, so it never runs in a normal `npm test`.

**Files:**
- Create: `route-generator/test/live-smoke.test.ts`

- [ ] **Step 1: Add the live smoke test** (take as-is)

`route-generator/test/live-smoke.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { generateRoute } from '../src/generator.js';

/** Hits the real ORS API. Opt in with: ORS_LIVE_TEST=1 ORS_API_KEY=<key> npm test */
const START = { lat: 51.5074, lng: -0.1278 };
const TARGET_M = 5000;

const live = process.env.ORS_LIVE_TEST === '1' ? describe : describe.skip;

live('live ORS round_trip', () => {
  it('generates a ~5k loop with turns', async () => {
    const route = await generateRoute(START.lat, START.lng, TARGET_M);

    console.log(
      `target ${TARGET_M}m -> actual ${route.distance_m}m ` +
        `(${route.distance_m - TARGET_M >= 0 ? '+' : ''}${route.distance_m - TARGET_M}m), ` +
        `${route.turns.length} turns`,
    );

    expect(route.distance_m).toBeGreaterThan(0);
    expect(route.turns.length).toBeGreaterThan(0);
    for (const turn of route.turns) {
      expect(['left', 'right']).toContain(turn.dir);
      expect(Math.abs(turn.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(turn.lng)).toBeLessThanOrEqual(180);
    }
  }, 30_000);
});
```

Change `START` to somewhere you'd actually run from.

- [ ] **Step 2: Verify it is skipped by default**

Run: `npm test` → PASS, live suite reported as **skipped**.

- [ ] **Step 3: Run it for real**

Copy `.env.example` to `.env` with your key, then:
```bash
ORS_LIVE_TEST=1 ORS_API_KEY=<your-key> npm test
```
Expected: PASS, plus a line like `target 5000m -> actual 5140m (+140m), 23 turns`.

**This output is the milestone's actual finding.** Record the real-vs-target gap — it tells us whether `EARLY_OUT_M = 100` and `N = 4` are sane or need tuning, which is the one thing we could not know before running it.

- [ ] **Step 4: Commit**

```bash
git add route-generator/test/live-smoke.test.ts
git commit -m "test(route-generator): add opt-in live ORS smoke test"
```

---

## Notes

- **Deviation from the writing-plans skill:** that skill mandates complete implementation code in every step, because it assumes a zero-context agent executes the plan. Ty is the implementer, so implementations are left as signatures + rules — the tests are the spec. Tests, scaffolding, type/constant declarations and entry points are given complete, since transcribing those teaches nothing.
- **Deviation from the design spec 1:** the spec sketched a `test/fixtures/` directory. Fixtures turned out small enough to inline in each test. Once the live test runs, consider replacing the inline ORS response in `ors-client.test.ts` with a real recorded one for higher fidelity.
- **Deviation from the design spec 2:** the spec listed a single `server.ts`. It's split into `server.ts` (`buildServer`) and `index.ts` (the runnable entry). The split is what makes the endpoint testable via `app.inject`.
- **Deferred, do not build:** out-and-back shape, endpoint auth, polyline/off-route data, elevation, self-hosted GraphHopper, the block-perimeter model.
