import { Pool } from "pg";

// Direct Postgres helpers for specs that must touch global server state the UI can't easily set up
// (the images and home_overrides tables). Each call opens and closes its own pool so no handle
// lingers to block a Playwright worker's exit. DATABASE_URL is the same DB `next start` serves (set
// by the runner).

async function dbQuery(sql: string, params?: unknown[]): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set for the DB test helpers.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(sql, params);
  } finally {
    await pool.end();
  }
}

async function dbQueryRows<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set for the DB test helpers.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(sql, params);
    return rows as T[];
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

// --- home_overrides singleton (the home-page CMS blob) -------------------------------

/** Deletes the home_overrides row so the storefront falls back to the built-in home defaults. */
export async function clearHome(): Promise<void> {
  await dbQuery("DELETE FROM home_overrides");
}

/**
 * Upserts the home_overrides singleton (id = 1) with a raw jsonb blob. The storefront read runs it
 * through cleanHome(), so garbage falls back to defaults. Note: the server caches the home read for
 * HOME_REVALIDATE seconds, so this is only reliable BEFORE the first page load of the run (a cold
 * cache miss reads the seeded row). Mid-run setup should go through the editor (updateTag purges).
 */
export async function seedHomeRow(data: unknown): Promise<void> {
  await dbQuery(
    `INSERT INTO home_overrides (id, data) VALUES (1, $1::jsonb)
     ON CONFLICT (id) DO UPDATE SET data = $1::jsonb, updated_at = now()`,
    [JSON.stringify(data)],
  );
}

/** The current home_overrides blob (already cleaned by the save action), or {} when there is no row. */
export async function readHomeRow(): Promise<Record<string, unknown>> {
  const rows = await dbQueryRows<{ data: Record<string, unknown> }>("SELECT data FROM home_overrides WHERE id = 1");
  return rows[0]?.data ?? {};
}
