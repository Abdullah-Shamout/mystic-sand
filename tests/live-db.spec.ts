import { expect, test, type Page } from "@playwright/test";

import { readVariantStock, setVariantStock } from "./db";

// Phase 3c proof: the storefront reads the catalog from Postgres at request time (runtime-dynamic,
// tag-cached), and an admin edit is reflected immediately. The admin product editor saves via the
// saveProduct Server Action, which calls updateTag("catalog") — read-your-own-writes, no long wait.
// We change a product's price in the editor and a fresh storefront load reflects it; the list itself
// (server-fed live catalog) reflects it straight after the save redirect, no reload.
//
// Target is "Dune" (MS-DUNE-250), whose price no default-catalog spec asserts, reset through the
// list's Reset in a finally so the shared test DB is left at the seed value.

const FAR_FUTURE = 4102444800000; // ~ year 2100 (ms), so the admin opens without a real sign-in

async function signIn(page: Page) {
  // Phase 4: real login (argon2 + session cookie). globalSetup seeds this admin.
  const user = process.env.ADMIN_USERNAME ?? "admin";
  const pass = process.env.ADMIN_PASSWORD ?? "Test-Admin-2026!";
  await page.goto("/en/login/");
  await page.getByTestId("login-username").fill(user);
  await page.getByTestId("login-password").fill(pass);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/en\/admin(\/|$)/);
}

const SLUG = "dune";
const NAME = "Dune";
const SKU = "MS-DUNE-250";
const SENTINEL_STOCK = 7; // a live count that differs from the seed, to prove save/reset never clobber it
const SEED_PRICE = "KWD 7.500";
const NEW_PRICE = "KWD 33.300"; // a value no other product uses

test.describe("live DB reads via the admin editor (Phase 3c)", () => {
  test.skip(({ isMobile }) => isMobile, "Runs on the desktop project");

  test("an editor price change is reflected on the list and the storefront, then reset", async ({ page }) => {
    await signIn(page);
    const seedStock = await readVariantStock(SKU);
    try {
      // The seeded product page shows the seed price.
      await page.goto(`/en/product/${SLUG}/`);
      await expect(page.getByText(SEED_PRICE).first()).toBeVisible();

      // A live sale would leave variants.stock below the seed. Set a sentinel the editor save / list
      // Reset must NOT overwrite — this is the Phase-5b silent-oversell regression guard: a general
      // product save/reset writes stock back to the form/seed value, re-materialising sold units.
      await setVariantStock(SKU, SENTINEL_STOCK);

      // Edit the price in the admin editor and save (→ saveProduct → updateTag("catalog")).
      await page.goto(`/en/admin/products/edit/?p=${SLUG}`);
      const price = page.getByTestId("editor-variant-price-0");
      await expect(price).toHaveValue("7.500");
      await price.fill("33.300");
      await page.getByTestId("editor-save").click();
      await page.waitForURL(/\/admin\/products\/$/);

      // The save changed price but must leave the LIVE stock count untouched.
      expect(await readVariantStock(SKU)).toBe(SENTINEL_STOCK);

      // The products list (server-fed live catalog) reflects it straight away — no reload. This proves
      // the post-save router.refresh() re-read the DB through the shared layout.
      const row = page.locator(`[data-testid="product-row"][data-slug="${SLUG}"]`);
      await expect(row.getByText(NEW_PRICE)).toBeVisible();

      // A fresh storefront load reflects it. updateTag makes this read-your-own-writes; reload-until-
      // pass to stay robust to any cache timing (mirrors the home / settings specs).
      await expect(async () => {
        await page.goto(`/en/product/${SLUG}/`);
        await expect(page.getByText(NEW_PRICE).first()).toBeVisible({ timeout: 2000 });
      }).toPass({ timeout: 20000 });
    } finally {
      // Restore the seed via the list's Reset so the shared DB is left clean for the other specs.
      await page.goto("/en/admin/products/");
      await expect(page.getByTestId("products-add")).toBeVisible(); // wait for the list to hydrate
      const resetBtn = page
        .locator(`[data-testid="product-row"][data-slug="${SLUG}"]`)
        .getByRole("button", { name: `Reset ${NAME}`, exact: true });
      if (await resetBtn.count()) {
        await resetBtn.click();
        await page.getByTestId("confirm-accept").click();
        await expect(resetBtn).toHaveCount(0);
      }
      // Reset restores copy/price to the seed but must also PRESERVE the live stock count.
      expect(await readVariantStock(SKU)).toBe(SENTINEL_STOCK);
      // Restore the seed stock so the shared DB is left clean for later specs.
      await setVariantStock(SKU, seedStock);
    }
  });
});
