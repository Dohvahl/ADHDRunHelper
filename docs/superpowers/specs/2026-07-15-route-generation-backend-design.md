# Route-Generation Backend — Design Spec (Milestone 2, v1)

**Date:** 2026-07-15
**Status:** Draft for review
**Related:** [`DESIGN.md`](../../../DESIGN.md) (whole-project design)

## Purpose

A small HTTP service that turns *(start location, target distance)* into a
**loop** running route and returns it as the turns-only contract, so the watch
(and later the web app) can guide a runner with turn cues. Repeated requests for
the same start + distance are served from cache instead of re-hitting the routing
provider.

This is the highest-risk milestone: until it runs, we have no proof we can
generate a usable target-distance route at all. The design keeps the risky,
provider-specific parts thin and pushes every real decision into small pure
functions that are cheap to test.

## Scope

**In (v1):**
- Loop route generation from a start point and a target distance.
- Hosted OpenRouteService (ORS) as the routing provider.
- The turns-only contract (below).
- Persistent caching keyed by rounded location + distance.

**Out (deferred — noted, not built):**
- Out-and-back shape (easy to add later; not `round_trip`).
- Endpoint authentication (v1 is an open proxy to a rate-limited key — a real
  thing to fix before this is ever public).
- Polyline / off-route detection in the response (may reintroduce, size-capped).
- Self-hosted GraphHopper + the block-perimeter model + custom road-crossing
  weighting.
- Elevation.
- Unit conversion (the caller handles km/mi ↔ meters).

## The contract

```
GET /route?lat=<deg>&lng=<deg>&distance_m=<meters>
→ 200 { "distance_m": <actual meters>, "turns": [ { "lat":.., "lng":.., "dir":"left"|"right" }, ... ] }
```

- **Meters are canonical.** The endpoint is unit-agnostic; the caller converts
  the user's km/mi choice to meters before calling and back for display.
- `dir` is only ever `"left"` or `"right"`. A turn entry exists only where the
  runner actually turns — straight/continue/depart/arrive produce no entry.
- No `type` param (loop-only in v1). No auth.
- `distance_m` in the response is the *actual* route distance, which will differ
  from the requested target.

## Stack

TypeScript on Node, with:
- **Fastify** — HTTP server.
- **Zod** — request validation (parse/bound-check `lat`, `lng`, `distance_m`).
- **better-sqlite3** — synchronous SQLite for the cache.
- **Vitest** — tests.

## Components

Each is a small unit with one job, a clear interface, and (for the pure ones)
direct unit tests.

### `orsClient` — provider wrapper (I/O)
The only module that knows about ORS's HTTP API and the API key.
- **In:** `(lat, lng, lengthM, seed)`
- **Out:** a parsed candidate `{ distanceM, geometry, steps }` (geometry +
  maneuver steps as ORS returns them).
- Calls ORS `directions` with the `foot-walking` profile and the `round_trip`
  option (`length = lengthM`, `seed`).
- Reads `ORS_API_KEY` from the environment.
- Mocked in tests via a recorded real response fixture — never hits the network
  in the unit suite.

### `turns` — turn extractor (pure)
- **In:** ORS `steps` + the route `geometry`.
- **Out:** `[{ lat, lng, dir }]`.
- Each ORS step references a maneuver location by index into the geometry; we
  resolve that to a `lat/lng`. (This is why `orsClient` returns geometry even
  though the *response* omits the polyline — geometry is needed internally to
  place the turns.)
- Maps ORS instruction type → `left`/`right`: slight/normal/sharp left → `left`,
  same for right; straight/continue/keep/depart/arrive → dropped (no entry);
  roundabout → the net direction (a known rough edge).

### `selector` — candidate chooser (pure)
- **In:** a list of candidates (each with `distanceM`) + the `targetM`.
- **Out:** the chosen candidate.
- Rule: **early-out** — if any candidate is within `EARLY_OUT_M` (100 m) of the
  target, take it. Otherwise prefer the **smallest positive overshoot**
  (`distanceM ≥ targetM`, minimal excess); if none overshoot, take the
  **closest** by absolute difference.

### `generator` — orchestrator
- **In:** `(lat, lng, targetM)`
- **Out:** the contract object `{ distance_m, turns }`.
- Calls `orsClient` up to `N` (4) times with fixed seeds `0..3` (deterministic,
  reproducible). After each call, if the new candidate is within `EARLY_OUT_M` of
  the target, stop looping — a good-enough short-circuit that saves ORS calls.
  Whatever candidates were collected are passed to `selector`, which is the
  single authority on the final pick. Extract turns from the chosen candidate and
  assemble the contract.

### `cache` — persistent store
- SQLite, one table: key → route JSON.
- **Key:** `(round(lat, 3), round(lng, 3), distance_m)` (~110 m rounding, so
  bedroom/living-room/front-step collapse to one entry). Rounding is a pure,
  tested helper.
- `get(key)` / `put(key, route)`.

### `server` — HTTP (Fastify)
- `GET /route`: Zod-parse + bound-check params → compute cache key →
  `cache.get` → on hit, return; on miss, `generator.generate` → `cache.put` →
  return.

## Data flow

```
GET /route ──▶ validate (Zod) ──▶ cache.get(key)
                                     │hit │miss
                                     ▼    ▼
                                  return  generator
                                            │  up to 4×: orsClient(seed 0..3)
                                            │           └─ early-out check
                                            ▼
                                         selector ──▶ turns ──▶ contract
                                            │
                                            ▼
                                        cache.put ──▶ return
```

## Error handling

| Condition | Response |
|---|---|
| Missing/invalid params, or `distance_m` > ORS's 100 km `round_trip` cap | **400** + message |
| ORS unreachable / rate-limited / errors | **502** + JSON error body |
| No usable route after all N attempts | **422** "couldn't generate a route here" |

The watch already degrades to a plain run on any fetch failure, so a non-200 is
safe on the client side.

## Configuration

- `ORS_API_KEY` — from the environment. `.env` (gitignored) for local dev;
  `.env.example` committed with the key name only.
- Constants (in `config.ts`): `N = 4`, `EARLY_OUT_M = 100`, `ROUND_DECIMALS = 3`,
  ORS profile `foot-walking`, `round_trip` distance cap `100_000`.

## Project structure

Lives at repo-root `route-generator/`, alongside `watch-app/garmin/` (the Garmin
watch app) and the future `companion-web-app/`.

```
route-generator/
  src/
    server.ts        # Fastify app + GET /route
    config.ts        # env + constants
    types.ts         # shared types (Route, Turn, Candidate)
    ors-client.ts    # ORS round_trip wrapper (I/O)
    turns.ts         # pure turn extractor
    selector.ts      # pure candidate chooser
    generator.ts     # orchestrator
    cache.ts         # SQLite cache
  test/
    turns.test.ts
    selector.test.ts
    cache.test.ts
    server.test.ts   # endpoint with mocked orsClient
    fixtures/        # recorded ORS responses
  package.json
  tsconfig.json
  .env.example
```

## Testing

The pure logic is the payoff — it's where the real decisions live:

- **`turns`**: fixture ORS steps → expected turn list. Cases: slight/sharp
  collapse to left/right, non-turn filtering, roundabout net-direction, empty
  route.
- **`selector`**: candidates + target → expected pick. Cases: early-out ≤100 m,
  smallest-overshoot, all-undershoot fallback to closest, ties.
- **`cache` key**: rounding, nearby-point collapse, boundary effect; plus a
  `put`→`get` round-trip against a temp SQLite file.
- **`server` / `generator`**: integration test with a **mocked `orsClient`**
  (recorded response fixture). Covers a cache miss→hit, and the 400/422/502
  paths. No network.
- **Live smoke test**: opt-in (env-gated), hits real ORS once to eyeball route
  quality. Not part of the normal unit run.

## Known rough edges

- Roundabouts collapse to a single net-direction turn.
- Cache grid has boundary effects (points a few metres apart can straddle a cell
  edge); fine starting from a fixed home location.
- ORS `round_trip` distance accuracy is unknown until we run it; best-of-N is the
  hedge, and `N`/`EARLY_OUT_M` are the first knobs to tune.
