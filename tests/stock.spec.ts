import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// The stock system: per-size available stock, the admin Stock page, bag/checkout caps, the
// once-only decrement on a paid order, and backup/restore of the ledger. Run `npm run build`
// first — these hit the static export served at localhost:4319. Long flows run on desktop.

const FAR_FUTURE = 4102444800000; // ~ year 2100 (ms), so the admin opens without signing in

async function signIn(page: Page) {
  await page.addInitScript((exp) => {
    try {
      sessionStorage.setItem("ms-admin-session", JSON.stringify({ u: "admin", exp }));
    } catch {
      // storage blocked
    }
  }, FAR_FUTURE);
}

/** Seed a zustand-persist store exactly as it is written to localStorage (runs on every load). */
async function seedStore(page: Page, key: string, state: unknown, version: number) {
  await page.addInitScript(
    ({ key, state, version }) => localStorage.setItem(key, JSON.stringify({ state, version })),
    { key, state, version },
  );
}

const readSold = (page: Page): Promise<Record<string, number>> =>
  page.evaluate(() => JSON.parse(localStorage.getItem("ms-stock") || "{}").state?.sold ?? {});

async function setStock(page: Page, sku: string, value: number) {
  await page.goto("/en/admin/stock/");
  const row = page.locator(`[data-testid="stock-row"][data-sku="${sku}"]`);
  await expect(row).toBeVisible();
  await row.getByTestId("stock-input").fill(String(value));
  await row.getByTestId("stock-save").click();
  await expect(row).toHaveAttribute("data-available", String(value));
}

async function fillCheckout(page: Page, phone = "99123456") {
  await page.getByLabel("Full name").fill("Fatma Al-Kandari");
  await page.getByLabel("Mobile number").fill(phone);
  const area = page.getByRole("combobox", { name: "Area" });
  await area.fill("salm");
  await area.press("Enter");
  await page.getByLabel("Block").fill("10");
  await page.getByLabel("Street").fill("Baghdad Street");
  await page.getByLabel("House no.").fill("15");
  await page.getByRole("checkbox", { name: /I agree to the Terms/ }).check();
}

async function payWithKnet(page: Page) {
  await page.getByTestId("checkout-pay").first().click();
  await page.waitForURL(/\/checkout\/pay\//);
  await page.getByRole("radio", { name: /National Bank of Kuwait/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Submit" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  // Orders of KD 25 or more add the bank's SMS-code (OTP) step before capture.
  const otp = page.getByTestId("pay-otp-confirm");
  await Promise.race([
    page.waitForURL(/\/checkout\/result\//, { timeout: 15_000 }),
    otp.waitFor({ state: "visible", timeout: 15_000 }),
  ]).catch(() => {});
  if (await otp.isVisible().catch(() => false)) await otp.click();
  await page.waitForURL(/\/checkout\/result\//, { timeout: 15_000 });
}

test.describe("stock system", () => {
  test.skip(({ isMobile }) => isMobile, "Long flows run on the desktop project");

  test("I set to 2 caps the bag, sells out after buying 2, and + makes it buyable again", async ({ page }) => {
    await signIn(page);
    await setStock(page, "MS-I-50", 2);

    // Product page shows the low-stock hint and the quantity stepper caps at 2.
    await page.goto("/en/product/i/");
    await expect(page.getByTestId("pdp-low-stock")).toHaveText("Only 2 left");
    const qty = page.getByRole("group", { name: "Quantity for I" }).first();
    await qty.getByRole("button", { name: "Increase quantity" }).click(); // 1 → 2
    await expect(qty.getByRole("button", { name: "Maximum quantity reached" })).toBeDisabled();

    // Add 2 to the bag; the bag line also caps at 2.
    await page.getByTestId("pdp-add-to-bag").click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByTestId("bag-line")).toHaveCount(1);
    await expect(
      drawer.getByRole("group", { name: "Quantity for I" }).getByRole("button", { name: "Maximum quantity reached" }),
    ).toBeDisabled();

    // Quick add beyond the cap is refused, with the "max reached" toast.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(700); // clear the double-tap guard
    await page.getByTestId("pdp-add-to-bag").click();
    await expect(page.getByText("You can add up to 2 of this item.")).toBeVisible();

    // Buy the 2 with KNET.
    await page.goto("/en/checkout/");
    await fillCheckout(page);
    await payWithKnet(page);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Thank you");

    // I is now sold out on its page and card, and cannot be added.
    await page.goto("/en/product/i/");
    await expect(page.getByRole("button", { name: "Sold out", exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("pdp-add-to-bag")).toHaveCount(0);

    await page.goto("/en/shop/perfumes/");
    const card = page.locator('article:has(a[href$="/product/i/"])');
    await expect(card.getByText("Sold out")).toBeVisible();
    await expect(card.getByTestId("quick-add-i")).toHaveCount(0);

    // The Stock page shows available 0 with 2 sold since set.
    await page.goto("/en/admin/stock/");
    const row = page.locator('[data-testid="stock-row"][data-sku="MS-I-50"]');
    await expect(row).toHaveAttribute("data-available", "0");
    await expect(row).toHaveAttribute("data-sold", "2");

    // "+" raises available to 1 (and clears the sold counter) — buyable again.
    await row.getByTestId("stock-inc").click();
    await expect(row).toHaveAttribute("data-available", "1");
    await expect(row).toHaveAttribute("data-sold", "0");

    await page.goto("/en/product/i/");
    await expect(page.getByTestId("pdp-low-stock")).toHaveText("Only 1 left");
    await expect(page.getByTestId("pdp-add-to-bag")).toBeEnabled();
  });

  test("a multi-size product with one size at 0 keeps the other size buyable", async ({ page }) => {
    await signIn(page);
    await setStock(page, "MS-OUDCHIPS-3T", 0);

    await page.goto("/en/product/oud-chips/");
    // The sold-out size is shown, disabled; the in-stock size is selectable and buyable.
    await expect(page.getByRole("radio", { name: /3 Tola/ })).toBeDisabled();
    await expect(page.getByRole("radio", { name: /1 Tola/ })).toBeEnabled();
    await expect(page.getByTestId("pdp-add-to-bag")).toBeEnabled();
    await page.getByTestId("pdp-add-to-bag").click();
    await expect(page.getByRole("dialog").getByTestId("bag-line")).toHaveCount(1);

    // The card still offers "Choose size" (the product is not sold out).
    await page.goto("/en/shop/oud/");
    const card = page.locator('article:has(a[href$="/product/oud-chips/"])');
    await expect(card.getByRole("link", { name: "Choose size" }).first()).toBeVisible();
  });

  test("an over-stock bag is clamped to the available quantity with a notice", async ({ page }) => {
    // I's base stock is 24; 22 sold → available 2. Bag holds 5.
    await seedStore(page, "ms-stock", { sold: { "MS-I-50": 22 } }, 1);
    await seedStore(page, "ms-bag", { lines: [{ sku: "MS-I-50", qty: 5 }], promo: null }, 2);

    await page.goto("/en/cart/");
    const line = page.getByTestId("bag-line");
    await expect(line).toHaveCount(1);
    await expect(line.getByTestId("bag-line-clamped")).toBeVisible();
    await expect(line.locator("output")).toHaveText("2");
  });

  test("an out-of-stock line in the bag blocks checkout until removed", async ({ page }) => {
    // I's base stock is 24; 24 sold → available 0.
    await seedStore(page, "ms-stock", { sold: { "MS-I-50": 24 } }, 1);
    await seedStore(page, "ms-bag", { lines: [{ sku: "MS-I-50", qty: 2 }], promo: null }, 2);

    await page.goto("/en/cart/");
    await expect(page.getByTestId("bag-line-oos")).toBeVisible();
    await expect(page.getByTestId("bag-checkout")).toHaveAttribute("aria-disabled", "true");

    // Checkout itself refuses too.
    await page.goto("/en/checkout/");
    await expect(page.getByText("Some items in your bag are no longer available.")).toBeVisible();
  });

  test("refreshing the result page does not decrement stock twice", async ({ page }) => {
    await page.goto("/en/product/i/");
    await page.getByTestId("pdp-add-to-bag").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.goto("/en/checkout/");
    await fillCheckout(page);
    await payWithKnet(page);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Thank you");

    expect((await readSold(page))["MS-I-50"]).toBe(1);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Thank you");
    expect((await readSold(page))["MS-I-50"]).toBe(1); // still 1, never 2
  });

  test("an Apple Pay express purchase decrements stock", async ({ page }) => {
    await page.goto("/en/product/i/");
    await page.getByTestId("pdp-add-to-bag").click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.goto("/en/checkout/?express=applepay");
    await page.getByTestId("applepay-confirm").click();
    await page.waitForURL(/\/checkout\/result\//, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Thank you");

    expect((await readSold(page))["MS-I-50"]).toBe(1);
  });

  test("sample orders never touch the stock ledger", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/");
    await expect
      .poll(async () => (await page.getByTestId("orders-count").innerText()).replace(/[^\d]/g, ""))
      .toBe("30");
    expect(Object.keys(await readSold(page))).toHaveLength(0);
  });

  test("backup carries the stock ledger and reset product edits clears it", async ({ page }) => {
    await signIn(page);
    await seedStore(page, "ms-stock", { sold: { "MS-I-50": 3 } }, 1);
    await page.goto("/en/admin/settings/");

    // The backup JSON includes the ledger.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("backup-download").click(),
    ]);
    const path = (await download.path())!;
    const json = JSON.parse(fs.readFileSync(path, "utf8"));
    expect(json.stock).toEqual({ "MS-I-50": 3 });

    // Reset product edits also clears the ledger.
    await page.getByTestId("reset-products").click();
    await page.getByTestId("confirm-accept").click();
    await expect.poll(() => readSold(page).then((s) => Object.keys(s).length)).toBe(0);

    // Restoring the backup brings it back.
    await page.getByTestId("backup-file").setInputFiles(path);
    await page.getByTestId("confirm-accept").click();
    await expect(page.getByText("Backup restored.")).toBeVisible();
    await expect.poll(() => readSold(page).then((s) => s["MS-I-50"] ?? 0)).toBe(3);
  });

  test("the Stock page opens without console errors in English and Arabic", async ({ page }) => {
    await signIn(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });
    for (const url of ["/en/admin/stock/", "/ar/admin/stock/"]) {
      await page.goto(url, { waitUntil: "networkidle" });
      await expect(page.getByTestId("kpi-stock-units-value")).toBeVisible();
      await page.waitForTimeout(400);
    }
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
