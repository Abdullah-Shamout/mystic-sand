import { expect, test, type Page } from "@playwright/test";

// The stock system: per-size available stock, the admin Stock page, bag/checkout caps, the
// once-only decrement on a paid order, and the capture-time guard that never oversells. Run
// `npm run build` first — these hit the static export served at localhost:4319. Long flows run on desktop.

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
      .toBe("31");
    expect(Object.keys(await readSold(page))).toHaveLength(0);
  });

  // ── Capture-time guard: never sell out of stock, or more than the stock ──
  // A stored order in the ms-checkout shape, for seeding a pay/result page directly.
  const STORED_ORDER = (id: string, status: string, qty: number) => ({
    id,
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
    locale: "en",
    lines: [{ sku: "MS-I-50", slug: "i", qty, priceFils: 19000, name: "I", size: { en: "50 ml", ar: "50 مل" }, image: "renders/i" }],
    totals: { itemCount: qty, subtotalFils: 19000 * qty, discountFils: 0, deliveryFils: 1000, totalFils: 19000 * qty + 1000 },
    details: {
      name: "Stock Tester", phone: "99887766", email: "", areaId: "salmiya", housing: "house",
      block: "1", street: "Street 1", avenue: "", building: "5", floor: "", apartment: "",
      mapsLink: "", notes: "", deliveryMethod: "standard", paymentMethod: "knet", saveDetails: true,
    },
    promoCode: null,
    bagKey: `MS-I-50x${qty}|standard|`,
    method: "knet",
    status,
    attempts:
      status === "failed"
        ? [{ method: "knet", result: "NOT CAPTURED", paymentId: "100000000000000001", trackId: id, postDate: "1009", amountFils: 19000 * qty + 1000, at: new Date().toISOString() }]
        : [],
    finalizedAt: null,
  });

  test("opening the pay page for an order that now exceeds stock is refused", async ({ page }) => {
    // I's base stock is 24; 24 sold → available 0. The stored pending order asks for 1.
    await seedStore(page, "ms-stock", { sold: { "MS-I-50": 24 } }, 1);
    await seedStore(page, "ms-checkout", { draft: {}, remembered: null, lastOrderId: null, orders: { "MS-90001": STORED_ORDER("MS-90001", "pending", 1) } }, 2);

    await page.goto("/en/checkout/pay/?order=MS-90001&method=knet");
    await page.waitForURL(/\/cart\//);
    await expect(page.getByTestId("gateway")).toHaveCount(0);
    expect((await readSold(page))["MS-I-50"]).toBe(24); // never captured
  });

  test("Try again is refused when stock dropped below the order", async ({ page }) => {
    await seedStore(page, "ms-stock", { sold: { "MS-I-50": 24 } }, 1);
    await seedStore(page, "ms-checkout", { draft: {}, remembered: null, lastOrderId: null, orders: { "MS-90002": STORED_ORDER("MS-90002", "failed", 1) } }, 2);

    await page.goto("/en/checkout/result/?order=MS-90002");
    await expect(page.getByTestId("result-failed")).toBeVisible();
    await page.getByTestId("retry-payment").click();
    await page.waitForURL(/\/cart\//);
    await expect(page.getByTestId("gateway")).toHaveCount(0);
    expect((await readSold(page))["MS-I-50"]).toBe(24);
  });

  test("two tabs cannot both sell the last unit", async ({ page, context }) => {
    await signIn(page);
    await setStock(page, "MS-I-50", 1);

    // Tab A buys the last unit through KNET.
    await page.goto("/en/product/i/");
    await page.getByTestId("pdp-add-to-bag").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.goto("/en/checkout/");
    await fillCheckout(page);
    await payWithKnet(page);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Thank you");
    expect((await readSold(page))["MS-I-50"]).toBe(1);

    // Tab B holds an older pending order for the same SKU; capturing it is refused.
    const tabB = await context.newPage();
    await tabB.goto("/en/");
    await tabB.evaluate((order) => {
      const raw = JSON.parse(localStorage.getItem("ms-checkout") || "{}");
      const state = raw.state ?? { draft: {}, remembered: null, orders: {}, lastOrderId: null };
      state.orders[order.id] = order;
      localStorage.setItem("ms-checkout", JSON.stringify({ state, version: 2 }));
    }, STORED_ORDER("MS-90003", "pending", 1));

    await tabB.goto("/en/checkout/pay/?order=MS-90003&method=knet");
    await tabB.waitForURL(/\/cart\//);
    await expect(tabB.getByTestId("gateway")).toHaveCount(0);
    expect((await readSold(tabB))["MS-I-50"]).toBe(1); // still 1, never 2
    await tabB.close();
  });

  test("Apple Pay with no stock is refused", async ({ page }) => {
    await seedStore(page, "ms-stock", { sold: { "MS-I-50": 24 } }, 1);
    await seedStore(page, "ms-bag", { lines: [{ sku: "MS-I-50", qty: 1 }], promo: null }, 2);

    await page.goto("/en/checkout/?express=applepay");
    await page.waitForTimeout(700);
    // The sheet never captures: no confirm button appears and nothing is sold.
    await expect(page.getByTestId("applepay-confirm")).toHaveCount(0);
    await expect(page).toHaveURL(/\/en\/checkout\//);
    expect((await readSold(page))["MS-I-50"]).toBe(24);
  });

  test("quick add and the stepper never exceed the available stock", async ({ page }) => {
    await signIn(page);
    await setStock(page, "MS-I-50", 1);

    await page.goto("/en/product/i/");
    await expect(page.getByTestId("pdp-low-stock")).toHaveText("Only 1 left");
    const qty = page.getByRole("group", { name: "Quantity for I" }).first();
    await expect(qty.getByRole("button", { name: "Maximum quantity reached" })).toBeDisabled();

    await page.getByTestId("pdp-add-to-bag").click();
    await expect(page.getByRole("dialog").getByTestId("bag-line")).toHaveCount(1);

    // A second quick add is capped with the "max reached" toast; the bag still holds 1.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(700); // clear the double-tap guard
    await page.getByTestId("pdp-add-to-bag").click();
    await expect(page.getByText("You can add up to 1 of this item.")).toBeVisible();
    const lineQty = await page.evaluate(() => JSON.parse(localStorage.getItem("ms-bag") || "{}").state?.lines?.[0]?.qty);
    expect(lineQty).toBe(1);
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
