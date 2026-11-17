"use server";

import { updateTag } from "next/cache";
import { z } from "zod";

import { cleanHome, type HomeOverrides, type HomeSection } from "@/lib/home";
import { requireAdmin } from "@/server/auth/require-admin";
import { schema } from "@/server/db";
import { HOME_LOCK, withAdvisoryLock, type Tx } from "@/server/db/locks";

// The admin writes for the home-page CMS singleton (home_overrides, id = 1, jsonb `data`). The editor
// saves one section at a time, so saveHomeSection takes a PATCH and merges it over the current row —
// a naive full upsert would wipe the sections the editor didn't touch. cleanHome() is the domain
// sanitiser: it accepts arbitrary input and strips/defaults anything invalid, so it is the injection
// boundary for the jsonb blob. The only thing zod guards here is the section key (an unknown key must
// be rejected rather than written through).

/** The nine override sections (the ticker is a settings field, saved via saveSettings). */
const sectionSchema = z.enum([
  "hero",
  "trilogy",
  "story",
  "duo",
  "feature",
  "film",
  "homeGrid",
  "services",
  "instagram",
]);

/**
 * The current overrides blob from the singleton row (or {} when there is no row yet). Reads through
 * the given handle — inside saveHomeSection this is the advisory-locked `tx`, so the read is serialised
 * with the upsert that follows (no lost update between concurrent section saves).
 */
async function currentOverrides(reader: Tx): Promise<Record<string, unknown>> {
  const [row] = await reader.select().from(schema.homeOverrides).limit(1);
  const data = row?.data;
  return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
}

/** Sanitises `next` through cleanHome() and upserts the home singleton on `tx`. Returns the cleaned
 * blob. The caller expires the "home" tag AFTER the transaction commits (a Next cache op, not a DB write). */
async function upsertOverrides(tx: Tx, next: Record<string, unknown>): Promise<HomeOverrides> {
  const cleaned = cleanHome(next);
  const row = { id: 1 as const, data: cleaned, updatedAt: new Date() };
  await tx
    .insert(schema.homeOverrides)
    .values(row)
    .onConflictDoUpdate({ target: schema.homeOverrides.id, set: { data: cleaned, updatedAt: row.updatedAt } });
  return cleaned;
}

/** updateTag (Server-Actions-only) IMMEDIATELY expires the "home" tag, so the admin's own
 * router.refresh() and the storefront both read the new value on their next read. revalidateTag is
 * stale-while-revalidate here, which would break read-your-own-writes. HOME_REVALIDATE is only a
 * time-based backstop. Called AFTER the advisory-locked tx commits (cache op, not a DB write). */
function expireHome(): void {
  updateTag("home");
}

/**
 * Saves one home section: validates `section` against the known keys, then — under the home singleton's
 * advisory lock — merges `value` over the current blob (a null/undefined `value` DELETES the section —
 * reset-to-built-in), runs cleanHome() and upserts the singleton. requireAdmin + the zod parse stay
 * lock-free; the read→merge→sanitise→upsert runs INSIDE the lock so two concurrent section saves can't
 * lose an update. Returns the resolved overrides for the admin UI.
 */
export async function saveHomeSection(section: HomeSection, value: unknown | null): Promise<HomeOverrides> {
  await requireAdmin();
  const key = sectionSchema.parse(section);

  const cleaned = await withAdvisoryLock(HOME_LOCK, async (tx) => {
    const next = { ...(await currentOverrides(tx)) };
    if (value == null) delete next[key];
    else next[key] = value;
    return upsertOverrides(tx, next);
  });

  expireHome();
  return cleaned;
}

/**
 * Clears every home override (upserts an empty blob). Returns the resolved (empty) overrides. Takes the
 * SAME advisory lock as saveHomeSection: a blind reset is not itself an RMW, but without the lock it
 * could commit between a concurrent saveHomeSection's read and upsert, and that save would silently
 * resurrect the sections the reset just cleared.
 */
export async function resetAllHome(): Promise<HomeOverrides> {
  await requireAdmin();
  const cleaned = await withAdvisoryLock(HOME_LOCK, (tx) => upsertOverrides(tx, {}));
  expireHome();
  return cleaned;
}
