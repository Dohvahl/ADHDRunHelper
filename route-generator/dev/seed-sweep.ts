// Dev-only, one-off exploration. Fires a large batch of seeds at ORS and reports
// which ones actually produce a usable route, so we can tell whether a starved
// tolerance band is bad luck with a particular seed set or the shape of everything
// ORS will offer at this location.
//
// Run from route-generator/:  npm run sweep -- <lat> <lng> <distanceMeters> [count] [--request=N]
// e.g.                        npm run sweep -- 53.521626 -113.674026 5000 40
//
// --request=N asks ORS for N metres while still judging the band against the target
// above. ORS treats round_trip.length as a loose suggestion and overshoots, so this
// measures whether requesting less lands us closer — calibration, not guesswork.
//   npm run sweep -- 53.521626 -113.674026 5000 40 --request=3760
//
// Needs ORS_API_KEY in .env.

import { DISTANCE_TOLERANCE } from '../src/config.js';
import { fetchRoundTrip } from '../src/ors-client.js';
import { isSafe } from '../src/safety.js';
import { isWithinTolerance } from '../src/selector.js';
import { Waytype, type Candidate } from '../src/types.js';

try {
  process.loadEnvFile?.('.env');
} catch {
  // no .env — assume ORS_API_KEY is already exported
}

// ORS's free tier allows roughly 40 directions requests per minute. Batching keeps
// a big sweep under that: 8 in flight, then a pause, is ~40/min.
const BATCH_SIZE = 8;
const BATCH_PAUSE_MS = 12_000;

const allArgs = process.argv.slice(2);
const args = allArgs.filter((arg) => !arg.startsWith('--'));
const lat = Number(args[0] ?? 51.5074);
const lng = Number(args[1] ?? -0.1278);
const targetM = Number(args[2] ?? 5000);
const count = Number(args[3] ?? 40);

/** What we ask ORS for. Defaults to the target; --request lets us ask for less. */
const requestM = Number(allArgs.find((a) => a.startsWith('--request='))?.split('=')[1] ?? targetM);

if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
  console.error(`Bad coordinate: lat=${lat}, lng=${lng}. Expected <lat> <lng>.`);
  process.exit(1);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function share(candidate: Candidate, waytype: Waytype): number {
  return Math.round(candidate.waytypes.find((w) => w.value === waytype)?.amount ?? 0);
}

async function main(): Promise<void> {
  const seeds = Array.from({ length: count }, (_, i) => i + 1);
  const lower = Math.round(targetM * (1 - DISTANCE_TOLERANCE));
  const upper = Math.round(targetM * (1 + DISTANCE_TOLERANCE));

  console.log(`sweep: ${count} seeds, target ${targetM}m (band ${lower}–${upper}m)`);
  if (requestM !== targetM) {
    console.log(`asking ORS for ${requestM}m (${(requestM / targetM).toFixed(2)}x target)`);
  }
  console.log(`batching ${BATCH_SIZE} at a time to stay inside ORS's rate limit\n`);
  console.log('  seed   dist  safe  inBand   road  street  footway  cycleway');

  const results: Array<{ seed: number; candidate: Candidate | null }> = [];

  for (let start = 0; start < seeds.length; start += BATCH_SIZE) {
    const batch = seeds.slice(start, start + BATCH_SIZE);
    const fetched = await Promise.all(
      batch.map(async (seed) => ({ seed, candidate: await fetchRoundTrip(lat, lng, requestM, seed) })),
    );

    for (const result of fetched) {
      results.push(result);
      const { seed, candidate } = result;
      if (!candidate) {
        console.log(`  ${String(seed).padStart(4)}      —     —       —`);
        continue;
      }
      console.log(
        `  ${String(seed).padStart(4)}  ${String(Math.round(candidate.distanceM)).padStart(5)}   ` +
          `${isSafe(candidate) ? 'yes' : 'NO '}    ` +
          `${isWithinTolerance(candidate, targetM) ? 'YES' : ' no'}   ` +
          `${String(share(candidate, Waytype.ROAD)).padStart(4)}%  ` +
          `${String(share(candidate, Waytype.STREET)).padStart(4)}%  ` +
          `${String(share(candidate, Waytype.FOOTWAY)).padStart(6)}%  ` +
          `${String(share(candidate, Waytype.CYCLEWAY)).padStart(7)}%`,
      );
    }

    if (start + BATCH_SIZE < seeds.length) {
      await sleep(BATCH_PAUSE_MS);
    }
  }

  const returned = results.filter((r) => r.candidate !== null);
  const safe = returned.filter((r) => isSafe(r.candidate!));
  const usable = safe.filter((r) => isWithinTolerance(r.candidate!, targetM));

  console.log(`\nsummary: ${count} tried, ${returned.length} returned, ${safe.length} safe, ${usable.length} in band`);
  console.log(`usable seeds: [${usable.map((r) => r.seed).join(', ')}]`);

  if (returned.length > 0) {
    const distances = returned.map((r) => Math.round(r.candidate!.distanceM)).sort((a, b) => a - b);
    const median = distances[Math.floor(distances.length / 2)];
    console.log(`distances: min ${distances[0]}m, median ${median}m, max ${distances[distances.length - 1]}m`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
