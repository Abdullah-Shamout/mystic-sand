import "server-only";

import { unstable_cache } from "next/cache";

import { cleanHome, type HomeOverrides } from "@/lib/home";
import { getDb, schema } from "@/server/db";

import { STOREFRONT_REVALIDATE } from "./revalidate";

// Server read layer for the home-page CMS overrides. The home_overrides singleton (id = 1) holds a
// jsonb blob that is fed through the same cleanHome() sanitiser the client used, so the storefront
// falls back to the built-in message/photo/link for any absent or invalid field, exactly as today.
// The singleton row is created by the admin home save (Phase 3); until then there is no row and the
// storefront shows the built-in defaults.

async function readHome(): Promise<HomeOverrides> {
  const db = getDb();
  const [row] = await db.select().from(schema.homeOverrides).limit(1);
  return cleanHome(row?.data ?? {});
}

/** Home-page overrides, read from Postgres and tag-cached under "home" for later revalidateTag. */
export const getHomeData = unstable_cache(readHome, ["home-data"], {
  tags: ["home"],
  revalidate: STOREFRONT_REVALIDATE,
});
