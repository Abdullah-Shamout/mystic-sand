"use server";

import { updateTag } from "next/cache";
import { z } from "zod";

import { phoneStatus } from "@/lib/phone";
import { resolveSettings, type StoreSettings } from "@/lib/settings";
import { requireAdmin } from "@/server/auth/require-admin";
import { schema } from "@/server/db";
import { SETTINGS_LOCK, withAdvisoryLock, type Tx } from "@/server/db/locks";

// The one admin write for the settings singleton (delivery fee, WhatsApp, phone, ticker). Each
// settings card saves only its own fields, and the ticker is edited in the Home editor, so this
// takes a PATCH and merges it over the current row — a naive full upsert would wipe the fields the
// card didn't touch. zod rejects invalid input first (resolveSettings would otherwise silently swap
// a bad value for the default, which would look like a successful save of the wrong thing).

const patchSchema = z
  .object({
    standardFeeFils: z.number().int().min(0).max(50000),
    // Already normalized by the editor to "965XXXXXXXX"; must be a Kuwaiti mobile.
    whatsapp: z.string().refine((v) => phoneStatus(v) === "valid"),
    // Local 8 digits; a mobile or a landline is allowed.
    phone: z.string().refine((v) => {
      const s = phoneStatus(v);
      return s === "valid" || s === "landline";
    }),
    ticker: z.object({ en: z.array(z.string()), ar: z.array(z.string()) }).partial(),
  })
  .partial();

export type SettingsPatch = z.infer<typeof patchSchema>;

/**
 * Current resolved settings from the singleton row (or the defaults when there is no row yet). Reads
 * through the given handle — inside saveSettings this is the advisory-locked `tx`, so the read is
 * serialised with the upsert that follows (no lost update between concurrent saves).
 */
async function currentSettings(reader: Tx): Promise<StoreSettings> {
  const [row] = await reader.select().from(schema.settings).limit(1);
  if (!row) return resolveSettings(null);
  return resolveSettings({
    standardFeeFils: row.standardFeeFils,
    whatsapp: row.whatsapp,
    phone: row.phone,
    ticker: row.ticker,
  });
}

/**
 * Validates `input`, merges it over the current settings, runs the shared resolveSettings()
 * sanitizer, upserts the singleton (id = 1) and revalidates the "settings" tag so the storefront
 * reflects the change on its next read. Returns the resolved settings for the admin UI.
 */
export async function saveSettings(input: SettingsPatch): Promise<StoreSettings> {
  await requireAdmin();
  const patch = patchSchema.parse(input);

  // The read→merge→upsert runs under a per-singleton advisory lock so two concurrent saves can't lose
  // an update (both read the old row, each merges its own field, the later upsert wipes the other's).
  // The merge + resolveSettings sanitiser must sit INSIDE the lock because they operate on the
  // in-lock read (`current`); only requireAdmin + the zod parse above are lock-free. The lock
  // auto-releases at commit, and updateTag runs AFTER (a Next cache op, not a DB write).
  const resolved = await withAdvisoryLock(SETTINGS_LOCK, async (tx) => {
    const current = await currentSettings(tx);
    const merged = resolveSettings({
      standardFeeFils: patch.standardFeeFils ?? current.standardFeeFils,
      whatsapp: patch.whatsapp ?? current.whatsapp,
      phone: patch.phone ?? current.phone,
      ticker: patch.ticker
        ? { en: patch.ticker.en ?? current.ticker.en, ar: patch.ticker.ar ?? current.ticker.ar }
        : current.ticker,
    });

    const row = {
      id: 1 as const,
      standardFeeFils: merged.standardFeeFils,
      whatsapp: merged.whatsapp,
      phone: merged.phone,
      ticker: merged.ticker,
    };
    await tx.insert(schema.settings).values(row).onConflictDoUpdate({ target: schema.settings.id, set: row });
    return merged;
  });

  // updateTag (Server-Actions-only) IMMEDIATELY expires the "settings" tag, so the admin's own
  // router.refresh() and the storefront both read the new value on their next read. revalidateTag is
  // stale-while-revalidate here, which breaks read-your-own-writes. updateTag invalidates the
  // unstable_cache "settings" entry on demand.
  updateTag("settings");
  return resolved;
}
