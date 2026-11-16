import "server-only";

import { unstable_cache } from "next/cache";

import { resolveSettings, type StoreSettings } from "@/lib/settings";
import { getDb, schema } from "@/server/db";

import { SETTINGS_REVALIDATE } from "./revalidate";

// Server read layer for store settings. The settings singleton (id = 1) is fed through the same
// resolveSettings() validator the client used, so the resolved shape is identical to today.

async function readSettings(): Promise<StoreSettings> {
  const db = getDb();
  const [row] = await db.select().from(schema.settings).limit(1);
  if (!row) return resolveSettings(null);
  return resolveSettings({
    standardFeeFils: row.standardFeeFils,
    whatsapp: row.whatsapp,
    phone: row.phone,
    ticker: row.ticker,
  });
}

/**
 * Store settings, read from Postgres and tag-cached under "settings". saveSettings() calls
 * updateTag("settings") on every write (immediate expiry), so the admin and the storefront both
 * reflect a change on their next read; SETTINGS_REVALIDATE is only a time-based backstop.
 */
export const getSettingsData = unstable_cache(readSettings, ["settings-data"], {
  tags: ["settings"],
  revalidate: SETTINGS_REVALIDATE,
});
