// Dev-only. Runs the generator against REAL ORS and writes the result two ways:
//   - the wire contract (distance_m + turns) to the console
//   - a GeoJSON file you drag into https://geojson.io to see the actual route
//     (blue line = the path, red dot = a left turn, green dot = a right turn)
//
// Run from route-generator/:  npm run preview -- <lat> <lng> <distanceMeters>
// e.g.                        npm run preview -- 51.5074 -0.1278 5000
// Needs ORS_API_KEY in .env (this loads it) or in your shell env.

import { writeFileSync } from 'node:fs';
import { pickBest } from '../src/generator.js';
import { extractTurns } from '../src/turns.js';

// Load .env if the runtime supports it (Node >= 20.12); otherwise rely on the
// ambient environment. Wrapped so a missing file falls back rather than throwing.
try {
  process.loadEnvFile?.('.env');
} catch {
  // no .env — assume ORS_API_KEY is already exported
}

const DEFAULT = { lat: 51.5074, lng: -0.1278, distanceM: 5000 }; // central London
const OUT_FILE = 'route-preview.geojson';

const lat = Number(process.argv[2] ?? DEFAULT.lat);
const lng = Number(process.argv[3] ?? DEFAULT.lng);
const targetM = Number(process.argv[4] ?? DEFAULT.distanceM);

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

async function main(): Promise<void> {
  const best = await pickBest(lat, lng, targetM);
  const turns = extractTurns(best);
  const distanceM = Math.round(best.distanceM);

  console.log(JSON.stringify({ distance_m: distanceM, turns }, null, 2));
  const delta = distanceM - targetM;
  console.log(`\ntarget ${targetM}m -> actual ${distanceM}m (${delta >= 0 ? '+' : ''}${delta}m), ${turns.length} turns`);

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
