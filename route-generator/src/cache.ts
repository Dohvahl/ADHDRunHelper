import Database from 'better-sqlite3';
import { CACHE_VERSION, ROUND_DECIMALS } from './config.js';
import type { Route } from './types.js';

/**
 * toFixed keeps the sign of a negative value that rounds to zero: -0.0001 renders
 * "-0.000" while 0.0001 renders "0.000". That would split a single cell across two
 * keys for anyone running near the prime meridian or the equator, so collapse the
 * signed zero.
 */
function roundDegrees(degrees: number): string {
  const rounded = Number(degrees.toFixed(ROUND_DECIMALS));
  return (rounded === 0 ? 0 : rounded).toFixed(ROUND_DECIMALS);
}

/**
 * Rounding lat/lng to ~110 m means the same house always produces one key, so
 * asking for a 5k three times from your kitchen hits ORS once. The version prefix
 * invalidates every entry when the Route shape changes (see CACHE_VERSION).
 * Known rough edge: any grid has boundary effects — two points metres apart can
 * straddle a cell edge.
 */
export function cacheKey(lat: number, lng: number, distanceM: number): string {
  return `v${CACHE_VERSION}|${roundDegrees(lat)},${roundDegrees(lng)},${Math.round(distanceM)}`;
}

export class RouteCache {
  private readonly db: Database.Database;
  private readonly stmtGet: Database.Statement;
  private readonly stmtPut: Database.Statement;

  constructor(filename: string) {
    this.db = new Database(filename);
    this.db.exec('CREATE TABLE IF NOT EXISTS routes (key TEXT PRIMARY KEY, route TEXT NOT NULL)');
    this.stmtGet = this.db.prepare('SELECT route FROM routes WHERE key = ?');
    this.stmtPut = this.db.prepare('INSERT OR REPLACE INTO routes (key, route) VALUES (?, ?)');
  }

  get(key: string): Route | null {
    const row = this.stmtGet.get(key) as { route: string } | undefined;
    return row ? JSON.parse(row.route) : null;
  }

  put(key: string, route: Route): void {
    this.stmtPut.run(key, JSON.stringify(route));
  }

  close(): void {
    this.db.close();
  }
}
