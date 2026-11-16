import "dotenv/config";

import { join } from "node:path";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { db, pool } from "@/server/db";

// Applies pending migrations from ./drizzle. Run via `npm run db:migrate`.
// Migrations are generated with `npm run db:generate`; they are never run at request time.

async function main() {
  const migrationsFolder = join(process.cwd(), "drizzle");
  await migrate(db, { migrationsFolder });
  console.log("Migrations applied from", migrationsFolder);
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
