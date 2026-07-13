# ADHDRunHelper — Design Doc

_Living document. Last updated: 2026-07-10._

A running companion that generates a route of a target distance and guides you
through it with simple cues on a Garmin watch — so once the run starts, you can
stop thinking about the route and just run.

---

## 1. Goal & guiding principle

Runner inputs a distance. The app produces a route of (approximately) that
distance. During the run, the watch gives turn-by-turn cues (a vibrate + a
visual flash) so the runner never has to look at a map or memorize a route.

**Guiding principle:** the interface on every platform is as simple as possible.
Once the route is chosen and the run has started, the runner should not have to
think about navigation again.

---

## 2. Scope

### v1 (the thing we're building)
- One user (Ty), one phone, one watch (**Garmin VivoActive 4S**).
- Enter a target distance; get a route; run it with watch cues.
- Two run shapes: **out-and-back** and **loop**.
- Unit preference (km / miles) — display only.
- Route caching so the same request near the same spot reuses a route.
- Route viewable on a map on web/mobile.

### Non-goals for v1 (parking lot)
- Multiple users / accounts / sharing.
- Explicit warmup/cooldown distances or times.
- Literal sidewalk-accurate / pedestrian-only routing (start on street graph).
- The full "block-perimeter" route model (start with a cruder generator).
- On-watch map display (the 4S has no map screen — and we don't want one).

---

## 3. Corrected assumptions (things we learned early)

Recorded so we don't relitigate them:

1. **You cannot modify Garmin's native "Run" activity.** Connect IQ apps can't
   inject UI into it. Instead we build a *separate* Connect IQ app that records a
   real running activity (syncs to Garmin Connect, counts toward stats) with our
   own UI. Same feel, our code.
2. **Google Maps cannot generate "a loop of distance X."** Its Directions API
   only does A→B. It also restricts caching directions and turn-by-turn use in
   cheaper tiers — hostile to our plan. We use **OpenStreetMap (OSM)** based
   routing instead.
3. **"One app, three platforms" is really three codebases + a backend.** The
   watch must be Monkey C; it shares no code with web/phone.
4. **The VivoActive 4S has no map display.** Watch guidance is cues only
   (vibrate + screen-edge color), not a rendered map. This aligns with the goal.
5. **The watch can't easily authenticate to Google Drive**, and shouldn't hold a
   routing API key. So route storage/generation lives behind a simple backend
   URL the watch can fetch without an OAuth dance.

---

## 4. Architecture (Option A)

Chosen over a native-Android-companion approach because it keeps the watch code
minimal and the API key off the device.

```
   ┌─────────────┐        GET /route?lat&lng&dist&type        ┌──────────────┐
   │  Watch app  │ ──────────────────────────────────────────▶│              │
   │ (Monkey C)  │ ◀────────── route JSON (polyline+turns) ────│   Backend    │
   └─────────────┘   (via phone BLE + Garmin Connect Mobile)   │  (Python)    │
                                                               │  - routing   │
   ┌─────────────┐        same GET /route endpoint             │  - generator │
   │  Web / PWA  │ ──────────────────────────────────────────▶│  - cache     │
   │ (browser)   │ ◀────────── route JSON + map display ───────│              │
   └─────────────┘                                             └──────┬───────┘
                                                                      │
                                                              OSM routing engine
```

**Key property:** watch and web consume the **same route-JSON contract** from the
**same endpoint**. Define the contract once; build outward without rework.

### Component responsibilities

| Component | Does | Explicitly does NOT |
|-----------|------|---------------------|
| **Backend** (Python) | Generate the route, hold the routing API key, cache by rounded location + distance + type, serve route JSON | Store user accounts, talk to the watch over Bluetooth |
| **Watch app** (Monkey C) | Enter distance, fetch a route by URL, download it fully at run start, show pace/distance/time, fire turn cues, record a FIT activity | Generate routes, run the algorithm, hold API keys, render a map |
| **Web / PWA** | Enter distance, display route on a map, fetch from the same endpoint | Talk to the watch directly |

---

## 5. The route-JSON contract

The shared interface between all three components. **Precise schema is TBD —
defined for real in the watch spike (Milestone 1).** Rough shape:

- an ordered list of points (the polyline the runner follows),
- total distance,
- a list of **turns**: where each one is, and which way (left / right), so the
  watch knows when to cue.

Everything else is built to produce or consume this.

---

## 6. Route generation

### v1: crude waypoint generator (start here)
Place waypoints roughly on a circle sized to the target distance, route through
them on foot, measure the result, nudge, repeat. Ignores blocks and road
crossings. **Purpose is to prove the plumbing, not route quality.**

### Distance handling
- **Out-and-back:** route outward ~half the target, then return the same way.
- **Loop:** get as close to the target as possible. When not exact,
  **overshoot by the smallest margin** and treat the extra as a "cooldown."

### Eventual target: the block-perimeter model (Ty's mental model)
A loop is the **outer perimeter of a connected set of city blocks.**
- "Follow the sidewalk, never cross a road" = trace one block's boundary.
- **Lengthen** = add an adjacent block; trace the outer boundary of the bigger
  shape.
- **Shorten** = cut across a cul-de-sac / crescent neck instead of walking
  around it.

"Never cross a road" is the real differentiator — fewer crossings = fewer
decisions = less to think about. Refinement: switch from the street graph to the
OSM **foot profile** so pedestrian-only paths (breezeways, cut-throughs,
mid-block connectors — like Google walking mode) are used.

Since sidewalks aren't reliably mapped in OSM, the interim stand-in for "follow
the sidewalk" is: route on the **street graph with a heavy road-crossing
penalty.**

---

## 7. Watch app (VivoActive 4S) — intended behavior

> Capabilities marked (verify) are assumptions to be proven in Milestone 1.

- **Distance input:** timer-style circular UI — digits 0–9 around the
  circumference, current value in the center, delete top-middle, accept
  bottom-middle. Units taken from the watch's own setting. _(Ty to share a
  screenshot of the timer interface when we design this screen.)_
- **During the run — shows:** pace, current distance, elapsed time (verify).
- **Turn cue:** a single vibrate + the relevant side/edge of the screen flashes a
  color (verify).
- **Records** a real FIT running activity that syncs to Garmin Connect (verify).
- **Downloads the whole route at run start** so navigation keeps working if the
  phone connection drops mid-run.

### Screen flow (draft)

Modeled to **mimic** native Garmin activity apps (Pool Swim especially). Every
screen is our own code — nothing is inherited from the native apps; "like the
native X" means "looks/behaves like it," not "reuses it."

1. **Launch** from the watch's activity list (a Connect IQ device app appears
   there alongside Run / Walk / Bike).
2. **Distance select** — a preset list (e.g. 5k / 10k / half / full / Custom).
   Custom → the circular touch input (0–9 around the ring, value in center,
   backspace top-middle, accept bottom-middle, units toggle on the right).
3. **Acquire GPS** — need at least a coarse fix *first*, because the route is
   generated from the start position.
4. **Calculate route** — cache hit = instant; cache miss = fetch from backend
   (needs phone).
5. **Ready screen** — mimics native, with a GPS/route status indicator:
   - Route available → normal "Ready" (green).
   - Cache miss + no phone, or route otherwise unavailable → user can **still
     start**, but as a **plain run**: track time / HR / distance / pace, with
     **no turn cues** (graceful degradation).
   - Swipe up → settings: **units** (display only — **no recalc**), **run type**
     loop/out-and-back (**recalc**). Changing distance also recalcs.
6. **Running** — mimic native Run data pages (our build); swipe between
   time / distance / pace / HR. Turn cue = single vibrate + screen-edge flash
   (only when a route is loaded).
7. **Buttons** — replicate native start/stop/lap. Guard the **Back** button so it
   can't accidentally exit a live run.
8. **End** → save; record a FIT running activity that syncs to Garmin Connect.

**Design principle:** navigation is a *layer on top of a plain run recorder*. The
base app records a run with data screens even with no route; turn-by-turn is an
enhancement. Milestone 1 builds the recorder first, cues second.

---

## 8. Caching

- **Cache key:** rounded start location + distance + run type (loop /
  out-and-back).
- "Same spot within roughly a house's radius" reuses the same route (bedroom vs
  living room vs front step = same start).
- Units are display-only and are **not** part of the key.
- Cache lives in the **backend** (this is what replaced the earlier
  "store in Google Drive" idea, which broke at the watch-fetch step).

---

## 9. Build order (riskiest-first)

1. **Watch spike.** Minimal Connect IQ app: fetch a *hardcoded* route JSON from a
   stub URL, show pace/distance/time, record a FIT activity, fire one vibrate +
   edge flash at a hardcoded trigger. Proves the (verify) items above and pins
   down the route-JSON contract. Uses the Connect IQ **simulator** — no physical
   watch needed until final validation.
2. **Backend + crude generator.** Python endpoint returning a real
   waypoint-generated route in the agreed JSON shape.
3. **Web / PWA.** Map display + distance input against the same endpoint.
4. **Integrate + caching.**
5. **Iterate** toward the block-perimeter model and foot routing.

---

## 10. Tech choices

### Decided
- Architecture: PWA + minimal backend + Monkey C watch app (Option A).
- Routing data: OpenStreetMap (not Google).
- Backend language: Python.
- Watch: Connect IQ / Monkey C, developed in VS Code + Monkey C extension +
  Connect IQ SDK (has a simulator).

### Open (to decide as their milestone approaches)
- Routing engine: OSRM vs Valhalla vs GraphHopper vs OSMnx-based. _(Milestone 2)_
- Backend web framework: e.g. FastAPI vs Flask. _(Milestone 2)_
- Web/PWA framework. _(Milestone 3)_
- Backend hosting: leaning zero-idle-cost serverless, not a 24/7 server.
  _(Low risk, decide late.)_

---

## 11. Decisions log

| Date | Decision |
|------|----------|
| 2026-07-10 | Separate Connect IQ app, not a modified native Run activity. |
| 2026-07-10 | OSM-based routing, not Google Maps. |
| 2026-07-10 | Option A: PWA + backend + watch; no native Android app. |
| 2026-07-10 | Backend holds the routing key, runs the generator, owns the cache. |
| 2026-07-10 | v1 route gen = crude waypoint generator on street graph (path b). |
| 2026-07-10 | Overshoot-by-smallest-margin = "cooldown"; warmup/cooldown deferred. |
| 2026-07-10 | Build order: watch spike → backend/generator → web → integrate → iterate. |
| 2026-07-10 | GPS fix comes before route calc (route is generated from the start position). |
| 2026-07-10 | Cache miss / no phone → user can still start a plain run (time/HR/distance/pace), no cues. Navigation is a layer over a plain run recorder. |
| 2026-07-10 | Unit change = display only (no recalc); run type / distance change = recalc. |
| 2026-07-10 | Watch app launches from the native activity list but re-implements all activity UI itself. |

---

## 12. Open questions

- Exact route-JSON schema (settle in Milestone 1).
- Is the Connect IQ dev environment set up? (VS Code present? SDK/extension?)
- Do the (verify) watch capabilities in §7 all hold on the real 4S?
