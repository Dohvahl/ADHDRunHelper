// Dev-only. Runs the generator against REAL ORS and writes the result two ways:
//   - the wire contract (distance_m + turns) to the console
//   - a GeoJSON file you drag into https://geojson.io to see the actual route
//     (blue line = the path, red dot = a left turn, green dot = a right turn)
//
// Run from route-generator/:  npm run preview -- <lat> <lng> <distanceMeters> [flags]
// e.g.                        npm run preview -- 51.5074 -0.1278 5000
//                             npm run preview -- 51.5074 -0.1278 5000 --random --count=20
//
// Flags:
//   --random          use random seeds instead of DEFAULT_SEEDS (the seeds used are
//                     always logged, so any run can be replayed exactly)
//   --count=N         how many seeds to try
//   --allow-shorter   accept routes below the target (default is target-or-longer)
//
// Needs ORS_API_KEY in .env (this loads it) or in your shell env.

import { writeFileSync } from 'node:fs';
import { DEFAULT_SEEDS, DISTANCE_TOLERANCE, REQUEST_SCALE, randomSeeds } from '../src/config.js';
import { fetchRoundTrip } from '../src/ors-client.js';
import { isSafe } from '../src/safety.js';
import { isWithinTolerance, select } from '../src/selector.js';
import { extractTurns } from '../src/turns.js';
import { Waytype, type Candidate } from '../src/types.js';

// Load .env if the runtime supports it (Node >= 20.12); otherwise rely on the
// ambient environment. Wrapped so a missing file falls back rather than throwing.
try {
  process.loadEnvFile?.('.env');
} catch {
  // no .env — assume ORS_API_KEY is already exported
}

const DEFAULT = { lat: 51.5074, lng: -0.1278, distanceM: 5000 }; // central London
const OUT_FILE = 'route-preview.geojson';

const args = process.argv.slice(2);
const flags = args.filter((arg) => arg.startsWith('--'));
const positional = args.filter((arg) => !arg.startsWith('--'));

const lat = Number(positional[0] ?? DEFAULT.lat);
const lng = Number(positional[1] ?? DEFAULT.lng);
const targetM = Number(positional[2] ?? DEFAULT.distanceM);

const useRandomSeeds = flags.includes('--random');
const allowShorter = flags.includes('--allow-shorter');
const seedCount = Number(flags.find((f) => f.startsWith('--count='))?.split('=')[1] ?? DEFAULT_SEEDS.length);

// Guard the classic trap: geojson.io lists coordinates as [lng, lat], the reverse
// of the <lat> <lng> this CLI takes, so copying from there silently swaps them —
// and a bad latitude otherwise surfaces only as a cryptic ORS 404.
if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
  console.error(
    `Bad coordinate: lat=${lat}, lng=${lng}.\n` +
      `Expected  <lat> <lng>  with lat in -90..90 and lng in -180..180.\n` +
      `geojson.io shows coordinates as [lng, lat] — the reverse — so copying from it swaps them.`,
  );
  process.exit(1);
}

/** Percentage of a candidate's distance spent on one way class. */
function share(candidate: Candidate, waytype: Waytype): number {
  return Math.round(candidate.waytypes.find((w) => w.value === waytype)?.amount ?? 0);
}

async function main(): Promise<void> {
  // Deliberately surveys EVERY seed with no early-out — unlike pickBest, which stops
  // as soon as one is good enough. Seeing the spread is the point: it tells us whether
  // arterial-heavy routes are one unlucky candidate or the shape of everything ORS
  // will offer here. Costs a full N calls every run; that's the price of the diagnosis.
  // Always log the seeds, random or not — an interesting route you cannot regenerate
  // is a route you cannot investigate. Copy them back in to reproduce any run.
  const seeds = useRandomSeeds ? randomSeeds(seedCount) : DEFAULT_SEEDS.slice(0, seedCount);
  console.log(`seeds${useRandomSeeds ? ' (random)' : ''}: [${seeds.join(', ')}]\n`);

  // Same scaling production uses, so the preview reflects what the app will do.
  const requestM = Math.round(targetM * REQUEST_SCALE);
  console.log(`asking ORS for ${requestM}m to land near ${targetM}m\n`);
  const surveyed = await Promise.all(seeds.map((seed) => fetchRoundTrip(lat, lng, requestM, seed)));

  console.log('candidate survey:');
  surveyed.forEach((candidate, i) => {
    const seed = seeds[i];
    if (!candidate) {
      console.log(`  seed ${seed}: no route`);
      return;
    }
    console.log(
      `  seed ${seed}: ${String(Math.round(candidate.distanceM)).padStart(5)}m  ` +
        `safe=${isSafe(candidate) ? 'yes' : 'NO '}  ` +
        `stateRoad=${share(candidate, Waytype.STATE_ROAD)}%  ` +
        `road=${share(candidate, Waytype.ROAD)}%  ` +
        `street=${share(candidate, Waytype.STREET)}%  ` +
        `footway=${share(candidate, Waytype.FOOTWAY)}%  ` +
        `cycleway=${share(candidate, Waytype.CYCLEWAY)}%`,
    );
  });

  const safe = surveyed.filter((c): c is Candidate => c !== null && isSafe(c));
  const usable = safe.filter((c) => isWithinTolerance(c, targetM, allowShorter));
  if (usable.length === 0) {
    const band = allowShorter
      ? `within ${DISTANCE_TOLERANCE * 100}% of ${targetM}m`
      : `between ${targetM}m and ${Math.round(targetM * (1 + DISTANCE_TOLERANCE))}m (pass --allow-shorter to widen)`;
    console.error(
      `\nNothing usable: ${surveyed.filter(Boolean).length} routes returned, ` + `${safe.length} safe, 0 ${band}.`,
    );
    process.exit(1);
  }

  const best = select(usable, targetM);
  const turns = extractTurns(best);
  const distanceM = Math.round(best.distanceM);
  console.log(`\nchosen: ${distanceM}m\n`);

  console.log(JSON.stringify({ distance_m: distanceM, turns }, null, 2));
  const delta = distanceM - targetM;
  console.log(
    `\ntarget ${targetM}m -> actual ${distanceM}m (${delta >= 0 ? '+' : ''}${delta}m), ${turns.length} turns`,
  );

  // What the route is actually made of. Without this we can only guess which class
  // of road an unpleasant stretch belongs to — and the safety rules are defined
  // entirely in terms of these classes.
  console.log('\nwaytype breakdown:');
  for (const entry of [...best.waytypes].sort((a, b) => b.distance - a.distance)) {
    const name = Waytype[entry.value] ?? 'UNRECOGNISED';
    console.log(`  ${name} (${entry.value}): ${Math.round(entry.distance)}m — ${entry.amount}%`);
  }

  const geojson = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'route', stroke: '#2563eb', 'stroke-width': 4 },
        geometry: { type: 'LineString', coordinates: best.geometry },
      },
      ...turns.map((turn, i) => ({
        type: 'Feature',
        properties: {
          name: `${i + 1}. ${turn.dir}`,
          'marker-color': turn.dir === 'left' ? '#dc2626' : '#16a34a',
        },
        geometry: { type: 'Point', coordinates: [turn.lng, turn.lat] },
      })),
    ],
  };

  writeFileSync(OUT_FILE, JSON.stringify(geojson, null, 2));
  console.log(`\nwrote ${OUT_FILE} — drag it onto https://geojson.io to see the route`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
