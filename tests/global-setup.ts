import { execSync } from "node:child_process";

// Playwright globalSetup: ensure the test DB is migrated + seeded before the run.
//
// Postgres itself is provided by the environment (CI service container, or the local dev DB — see
// README / docker-compose.dev.yml). DATABASE_URL must be set; the webServer (next start) runs with
// the same DATABASE_URL, so the server and these specs share one database.
//
// Seed is an idempotent upsert, so this also RESETS catalog / settings / stock to the seed defaults
// at the start of every run — the state the default-data specs assume (and what the live-db spec
// restores after its deliberate mutation).
//
// Note: Playwright starts the webServer BEFORE globalSetup, so the webServer readiness URL ("/") is
// a DB-free locale redirect (proxy.ts). The specs themselves run after this setup, against a
// migrated + seeded DB.
export default function globalSetup() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set for the Playwright run (used by migrate + seed and by `next start`).",
    );
  }
  const opts = { stdio: "inherit" as const, env: process.env };
  execSync("npm run db:migrate", opts);
  execSync("npm run db:seed", opts);
}
