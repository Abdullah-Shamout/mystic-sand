import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

// Drizzle DB client (node-postgres driver). Reads DATABASE_URL from the environment.
//
// Build-safe / lazy: importing this module must NOT create the Pool or throw. The production
// build runs with DATABASE_URL unset and never reads the DB (storefront reads are runtime-
// dynamic), so a server component may import this module during the DB-free build. The pool is
// created on the FIRST getDb() call and a clear error is thrown only if DATABASE_URL is missing
// AT CALL TIME.

export type Db = NodePgDatabase<typeof schema>;

let pool: Pool | undefined;
let db: Db | undefined;

/** The Drizzle client, created on first use. Throws if DATABASE_URL is unset at call time. */
export function getDb(): Db {
  if (!db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set. Copy .env.example to .env (see docker-compose.dev.yml).");
    }
    pool = new Pool({ connectionString });
    db = drizzle(pool, { schema });
  }
  return db;
}

/** The underlying pg Pool (created if needed). Used by the migrate/seed scripts to end() it. */
export function getPool(): Pool {
  getDb();
  return pool!;
}

export { schema };
