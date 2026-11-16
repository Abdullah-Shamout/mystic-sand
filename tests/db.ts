import { Pool } from "pg";

// Direct Postgres helpers for specs that must touch global server state the UI can't easily set up
// (the images table). Each call opens and closes its own pool so no handle lingers to block a
// Playwright worker's exit. DATABASE_URL is the same DB `next start` serves (set by the runner).

async function dbQuery(sql: string, params?: unknown[]): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set for the DB test helpers.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(sql, params);
  } finally {
    await pool.end();
  }
}

/** Deletes every uploaded-image row (the library lists from this table; images are not cached). */
export async function clearImages(): Promise<void> {
  await dbQuery("DELETE FROM images");
}

/**
 * Inserts a bare image row so the library lists `u:<id>` without an actual upload. No file is
 * written, so the served thumbnail 404s — fine for tests that only check the row is listed/deleted.
 */
export async function seedImageRow(id: string, kind: "packshot" | "photo" = "photo"): Promise<void> {
  await dbQuery(
    `INSERT INTO images (id, kind, width, height, mime, bytes, storage_path)
     VALUES ($1, $2, 8, 8, 'image/webp', 0, $3)
     ON CONFLICT (id) DO NOTHING`,
    [id, kind, `${id}.webp`],
  );
}
