"use server";

import { updateTag } from "next/cache";
import { z } from "zod";

import { cleanHome, type HomeOverrides, type HomeSection } from "@/lib/home";
import { requireAdmin } from "@/server/auth/require-admin";
import { getDb, schema } from "@/server/db";

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

/** The current overrides blob from the singleton row (or {} when there is no row yet). */
async function currentOverrides(): Promise<Record<string, unknown>> {
  const [row] = await getDb().select().from(schema.homeOverrides).limit(1);
  const data = row?.data;
  return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
}

/** Upserts the home singleton with a sanitised blob and expires the "home" tag. */
async function writeOverrides(next: Record<string, unknown>): Promise<HomeOverrides> {
  const cleaned = cleanHome(next);
  const row = { id: 1 as const, data: cleaned, updatedAt: new Date() };
  await getDb()
    .insert(schema.homeOverrides)
    .values(row)
    .onConflictDoUpdate({ target: schema.homeOverrides.id, set: { data: cleaned, updatedAt: row.updatedAt } });

  // updateTag (Server-Actions-only) IMMEDIATELY expires the "home" tag, so the admin's own
  // router.refresh() and the storefront both read the new value on their next read. revalidateTag is
  // stale-while-revalidate here, which would break read-your-own-writes. HOME_REVALIDATE is only a
  // time-based backstop.
  updateTag("home");
  return cleaned;
}

/**
 * Saves one home section: validates `section` against the known keys, merges `value` over the current
 * blob (a null/undefined `value` DELETES the section — reset-to-built-in), runs cleanHome() and
 * upserts the singleton. Returns the resolved overrides for the admin UI.
 */
export async function saveHomeSection(section: HomeSection, value: unknown | null): Promise<HomeOverrides> {
  await requireAdmin();
  const key = sectionSchema.parse(section);

  const next = { ...(await currentOverrides()) };
  if (value == null) delete next[key];
  else next[key] = value;

  return writeOverrides(next);
}

/** Clears every home override (upserts an empty blob). Returns the resolved (empty) overrides. */
export async function resetAllHome(): Promise<HomeOverrides> {
  await requireAdmin();
  return writeOverrides({});
}
