import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Reads DATABASE_URL from .env (loaded via dotenv above). Migrations are generated into
// ./drizzle and applied by scripts/migrate.ts — never at request time.

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set (drizzle.config.ts). Copy .env.example to .env.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
});
