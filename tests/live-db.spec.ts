import { expect, test } from "@playwright/test";
import { Pool } from "pg";

// Phase 2b proof: the storefront reads the catalog from Postgres at request time (runtime-dynamic,
// tag-cached), NOT from a shell baked at build time. With the DB seeded (default), /en/ shows the
// seeded catalog; then we change a product's price directly in the DB (SQL, no admin, no
// revalidateTag) and a fresh page load reflects it within the short revalidate window.
//
// Target SKU is MS-DUNE-250 ("Dune"), whose price no default-catalog spec asserts, and it is
// restored afterwards so the shared test DB is left at the seed value.

const SKU = "MS-DUNE-250";
const SLUG = "dune";
const SEED_PRICE_FILS = 7500; // "KWD 7.500"
const SEED_PRICE = "KWD 7.500";
const NEW_PRICE_FILS = 33300; // "KWD 33.300" — a value no other product uses
const NEW_PRICE = "KWD 33.300";

test.describe("live DB reads (Phase 2b)", () => {
  // One deliberate DB mutation; run it once on the desktop project.
  test.skip(({ isMobile }) => isMobile, "Runs on the desktop project");

  test("a direct DB price change is reflected on a fresh page load", async ({ page }) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      // The DB is seeded (default): /en/ renders and the product page shows the seeded price.
      const home = await page.goto("/en/");
      expect(home?.status()).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible();

      await page.goto(`/en/product/${SLUG}/`);
      await expect(page.getByText(SEED_PRICE).first()).toBeVisible();

      // Change the price directly in Postgres — no admin action, no revalidateTag.
      await pool.query("UPDATE variants SET price_fils = $1 WHERE sku = $2", [NEW_PRICE_FILS, SKU]);

      // A fresh page load reflects it (runtime-dynamic read; cached for ~1s then revalidated, so we
      // reload until it appears rather than assuming the very first reload is fresh).
      // NEW_PRICE is a value no other product uses, so its appearance proves the page re-read the
      // live DB (not a shell baked from build-time seed data). Reload until it appears: the read is
      // cached for ~1s then revalidated, so the very first reload may still be the stale value.
      await expect(async () => {
        await page.reload();
        await expect(page.getByText(NEW_PRICE).first()).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 20_000 });
    } finally {
      // Restore the seed value so the shared DB is left clean for the other specs / the next run.
      await pool.query("UPDATE variants SET price_fils = $1 WHERE sku = $2", [SEED_PRICE_FILS, SKU]);
      await pool.end();
    }
  });
});
