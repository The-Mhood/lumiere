import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { bootstrapSchema } from "./bootstrap";
import * as schema from "./schema";

/**
 * Database access — two interchangeable drivers behind one `db` handle:
 *
 *  - `DATABASE_URL` set  → real PostgreSQL via `node-postgres` (production /
 *    web deployments, `drizzle-kit push` for schema management).
 *  - `DATABASE_URL` unset → embedded PostgreSQL (PGlite, a WASM build of
 *    PostgreSQL) stored on disk under `LUMIERE_DATA_DIR` (default
 *    `./.lumiere-data`). This is what the desktop app and local development
 *    use: no external database server to install or run. Set
 *    `LUMIERE_DATA_DIR=memory` for an ephemeral in-memory database (tests).
 *
 * Both drivers speak the same PostgreSQL dialect, so the Drizzle schema and
 * queries are identical. The schema is bootstrapped idempotently on startup
 * (see `./bootstrap.ts`), so a fresh checkout works with `npm run dev`
 * without any manual migration step.
 */

export type LumiereDb = NodePgDatabase<typeof schema>;

const databaseUrl = process.env.DATABASE_URL;

export const dbMode: "postgres" | "pglite" = databaseUrl ? "postgres" : "pglite";

let _db: LumiereDb;
let _close: () => Promise<void>;

if (databaseUrl) {
  const globalForDb = globalThis as typeof globalThis & {
    __lumierePgPool?: Pool;
  };
  const pool =
    globalForDb.__lumierePgPool ??
    new Pool({ connectionString: databaseUrl });
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__lumierePgPool = pool;
  }
  _db = drizzle(pool, { schema });
  _close = () => pool.end();
} else {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
  const dataDir = process.env.LUMIERE_DATA_DIR ?? "./.lumiere-data";
  // Next can evaluate the DB module in more than one route bundle. PGlite is
  // single-owner: all bundles in this Node process must share one WASM client.
  const shared = globalThis as typeof globalThis & {
    __lumiereEmbedded?: Promise<import("@electric-sql/pglite").PGlite>;
  };
  shared.__lumiereEmbedded ??= PGlite.create(dataDir !== "memory" ? { dataDir } : undefined);
  const client = await shared.__lumiereEmbedded;
  _db = drizzlePglite(client, { schema }) as unknown as LumiereDb;
  _close = async () => { await client.close(); delete shared.__lumiereEmbedded; };
}

export const db: LumiereDb = _db;

/** Close the underlying connection (scripts, tests, graceful shutdown). */
export const closeDb: () => Promise<void> = _close;

await bootstrapSchema(db);

// Demo seeding is opt-in for test/development fixtures only. Production
// starts empty rather than presenting sample videos as the movie catalogue.
// User data is never touched: this only runs when there are no titles.
try {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.titles);
  if (count === 0 && process.env.LUMIERE_SEED_DEMOS === "1") {
    const { seedDatabase } = await import("./catalogue-seed");
    await db.transaction(async (tx) => { await seedDatabase(tx as unknown as LumiereDb); });
  }
} catch (e) {
  // Concurrent first boots can race the seed; the next boot will see a
  // non-empty catalogue. Never let seeding take the app down.
  console.warn("[db] auto-seed skipped:", (e as Error).message);
}
