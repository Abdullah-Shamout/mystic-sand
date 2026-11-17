import fs from "node:fs";
import { expect, test, type Page, type Request } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";

import { clearOrders, insertPaidOrder } from "./db";

// The admin area is a browser-only demo gate (see src/lib/admin-auth.ts). These tests cover
// the header entry, the sign-in flow, the signed-out gate and the admin-messages split.
// Run `npm run build` first — they hit the `next start` production server at localhost:4319.

const ADMIN_USER = "admin";
const ADMIN_PASS = "MysticSand@2026";
const OLD_ADMIN_PASS = "MysticSand2026";

test.describe("admin header entry", () => {
  test('the header offers "Enter" in English and "دخول" in Arabic', async ({ page }) => {
    await page.goto("/en/");
    await expect(page.getByRole("button", { name: "Enter", exact: true })).toBeVisible();

    await page.goto("/ar/");
    await expect(page.getByRole("button", { name: "دخول", exact: true })).toBeVisible();
  });

  test("the header does not overflow at 360px wide", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    for (const path of ["/en/", "/ar/"]) {
      await page.goto(path);
      await expect(page.getByRole("button", { name: /Enter|دخول/ })).toBeVisible();
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflows, `horizontal overflow on ${path}`).toBe(false);
    }
  });
});

test.describe("password field styling", () => {
  test("the built CSS hides Edge's reveal eye on password fields", async ({ page }) => {
    await page.goto("/en/");
    const hrefs = await page
      .locator('link[rel="stylesheet"]')
      .evaluateAll((els) => els.map((el) => (el as HTMLLinkElement).href));
    expect(hrefs.length).toBeGreaterThan(0);

    let css = "";
    for (const href of hrefs) {
      const res = await page.request.get(href);
      css += await res.text();
    }
    // Both separate rules, each setting display:none (minified or not).
    expect(css).toMatch(/::-ms-reveal\s*\{\s*display\s*:\s*none/);
    expect(css).toMatch(/::-ms-clear\s*\{\s*display\s*:\s*none/);
  });
});

// Phase 4 replaced the browser-only gate with argon2 + a DB session cookie. The real sign-in flow
// (wrong password, success, logout, unauthenticated redirect) is covered in auth.spec.ts.
test.describe.skip("admin sign-in", () => {
  test.skip(({ isMobile }) => isMobile, "Long flows run on the desktop project");

  test("a wrong password shows a generic error", async ({ page }) => {
    await page.goto("/en/");
    await page.getByRole("button", { name: "Enter", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Username", { exact: true }).fill(ADMIN_USER);
    await dialog.getByLabel("Password", { exact: true }).fill("not-the-password");
    await dialog.getByRole("button", { name: "Sign in" }).click();

    await expect(dialog.getByRole("alert")).toHaveText("Wrong username or password.");
    await expect(page).toHaveURL(/\/en\/$/);
  });

  test("correct credentials sign in, survive a reload, and log out", async ({ page }) => {
    await page.goto("/en/");
    await page.getByRole("button", { name: "Enter", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Username", { exact: true }).fill(ADMIN_USER);
    await dialog.getByLabel("Password", { exact: true }).fill(ADMIN_PASS);
    await dialog.getByRole("button", { name: "Sign in" }).click();

    // Lands in the admin area with the nav tabs.
    await page.waitForURL(/\/en\/admin\/$/);
    await expect(page.getByRole("link", { name: "Orders", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Home page", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Product analysis", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible();

    // The session survives a reload.
    await page.reload();
    await expect(page).toHaveURL(/\/en\/admin\/$/);
    await expect(page.getByRole("link", { name: "Orders", exact: true })).toBeVisible();

    // Back on the store the header entry now reads "Admin".
    await page.goto("/en/");
    await expect(page.getByRole("link", { name: "Admin", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enter", exact: true })).toHaveCount(0);

    // Log out from the admin area returns to the store and restores "Enter".
    await page.getByRole("link", { name: "Admin", exact: true }).click();
    await page.waitForURL(/\/en\/admin\/$/);
    await page.getByRole("button", { name: "Log out" }).click();
    await page.waitForURL(/\/en\/$/);
    await expect(page.getByRole("button", { name: "Enter", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
  });

  test("the admin area shows the sign-in page when signed out", async ({ page }) => {
    await page.goto("/en/admin/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Admin sign in");
    // The admin content and its nav are not rendered until signed in.
    await expect(page.getByRole("link", { name: "Product analysis", exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
  });

  test("the storefront home does not ship admin messages", async ({ page }) => {
    const response = await page.request.get("/en/");
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).not.toContain("Everything here is saved in this browser only.");
    expect(html).not.toContain("Product analysis");
  });
});

// ── Orders dashboard ──────────────────────────────────────────────────────────
// Long flows on the desktop project. The demo sample orders were retired in Phase 7, so the
// dashboard + analysis specs now seed REAL paid DB orders (insertPaidOrder) and clear them after.

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

type SeedOrder = Parameters<typeof insertPaidOrder>[0];

// A fixed set of real paid DB orders the dashboard/analysis specs run against. Varied customer,
// method, locale, age and line-up so the search / payment / period / collection assertions bite.
// Totals (insertPaidOrder adds a 1.000 KWD delivery fee): 20.000 / 14.000 / 13.000 / 8.500 /
// 32.000 / 58.000 KWD.
const SEED_ORDERS: SeedOrder[] = [
  { id: "MS-90001", name: "Fatma Al-Kandari", phone: "51112233", method: "knet", locale: "en", daysAgo: 1,
    lines: [{ sku: "MS-I-50", slug: "i", name: "I", qty: 1, priceFils: 19000 }] },
  { id: "MS-90002", name: "نورة المطيري", phone: "66223344", method: "applepay", locale: "ar", daysAgo: 3,
    lines: [{ sku: "MS-AURA-100", slug: "aura", name: "AURA", qty: 2, priceFils: 6500, sizeEn: "100 ml", sizeAr: "100 مل" }] },
  { id: "MS-90003", name: "Yousef Al-Sabah", phone: "90011223", method: "card", locale: "en", daysAgo: 10,
    lines: [{ sku: "MS-OUD-30", slug: "oud", name: "OUD", qty: 1, priceFils: 12000, sizeEn: "30 ml", sizeAr: "30 مل" }] },
  { id: "MS-90004", name: "Dana Al-Ajmi", phone: "55443322", method: "knet", locale: "en", daysAgo: 40,
    lines: [{ sku: "MS-MIST-250", slug: "mist", name: "Mist", qty: 1, priceFils: 7500, sizeEn: "250 ml", sizeAr: "250 مل" }] },
  { id: "MS-90005", name: "Abdulaziz Al-Mutairi", phone: "67095252", method: "knet", locale: "en", daysAgo: 1,
    lines: [
      { sku: "MS-I-50", slug: "i", name: "I", qty: 1, priceFils: 19000 },
      { sku: "MS-CAFE-30", slug: "cafe", name: "Café", qty: 1, priceFils: 12000, sizeEn: "30 ml", sizeAr: "30 مل" },
    ] },
  { id: "MS-90006", name: "Khaled Al-Dosari", phone: "94567890", method: "knet", locale: "en", daysAgo: 5,
    lines: [{ sku: "MS-III-50", slug: "iii", name: "III", qty: 3, priceFils: 19000 }] },
];
const SEED_COUNT = SEED_ORDERS.length;

/** total fils for a seeded order = Σ(line price × qty) + 1.000 KWD delivery. */
const orderTotal = (o: SeedOrder) => (o.lines ?? []).reduce((n, l) => n + l.priceFils * l.qty, 0) + 1000;
/** total units for a seeded order. */
const orderUnits = (o: SeedOrder) => (o.lines ?? []).reduce((n, l) => n + l.qty, 0);

async function seedOrders() {
  await clearOrders();
  for (const o of SEED_ORDERS) await insertPaidOrder(o);
}

/** Pre-seeds the ms-admin fulfilment (marked-done) flags for the given order ids, then signs in.
 *  Do NOT use for specs that then mark done through the UI (the init script re-seeds on reload). */
async function signInWithDone(page: Page, doneIds: string[]) {
  await page.addInitScript((ids) => {
    const fulfillment: Record<string, { doneAt: string }> = {};
    for (const id of ids) fulfillment[id] = { doneAt: new Date().toISOString() };
    localStorage.setItem("ms-admin", JSON.stringify({ state: { fulfillment }, version: 2 }));
  }, doneIds);
  await signIn(page);
}

const readInt = async (page: Page, testId: string) =>
  parseInt((await page.getByTestId(testId).innerText()).replace(/[^\d]/g, "") || "0", 10);
const readKwd = async (page: Page, testId: string) =>
  Math.round(parseFloat((await page.getByTestId(testId).innerText()).replace(/[^0-9.]/g, "") || "0") * 1000);
const resultCount = async (page: Page) => {
  const text = await page.getByTestId("orders-count").innerText();
  return /no orders/i.test(text) ? 0 : parseInt(text.replace(/[^\d]/g, "") || "0", 10);
};
const toArabicIndic = (s: string) => s.replace(/[0-9]/g, (d) => String.fromCharCode(0x0660 + Number(d)));

test.describe("admin orders dashboard", () => {
  test.skip(({ isMobile }) => isMobile, "Long flows run on the desktop project");
  test.beforeEach(seedOrders);
  test.afterEach(() => clearOrders());

  test("lists the seeded DB orders with matching KPI counts and revenue", async ({ page }) => {
    const doneIds = ["MS-90001", "MS-90005"];
    await signInWithDone(page, doneIds);
    await page.goto("/en/admin/");
    await expect.poll(() => resultCount(page)).toBe(SEED_COUNT);
    // No sample orders remain, so nothing carries a "Sample" tag.
    await expect(page.getByText("Sample", { exact: true })).toHaveCount(0);

    const doneRevenue = SEED_ORDERS.filter((o) => doneIds.includes(o.id)).reduce((n, o) => n + orderTotal(o), 0);
    const kpiCompleted = await readInt(page, "kpi-completed-value");
    const kpiPending = await readInt(page, "kpi-pending-value");
    expect(kpiCompleted + kpiPending).toBe(SEED_COUNT);
    expect(kpiCompleted).toBe(doneIds.length);
    expect(await readKwd(page, "kpi-revenue-value")).toBe(doneRevenue);
  });

  test("search narrows by Latin name, Arabic name and order number (Arabic digits too)", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/");
    await expect.poll(() => resultCount(page)).toBe(SEED_COUNT);
    const search = page.getByTestId("orders-search");

    await search.fill("Fatma Al-Kandari");
    await expect(page.getByText("MS-90001").first()).toBeVisible();
    await expect.poll(() => resultCount(page)).toBe(1);

    await search.fill("نورة المطيري");
    await expect(page.getByText("MS-90002").first()).toBeVisible();
    await expect.poll(() => resultCount(page)).toBe(1);

    // Order number in Arabic-Indic digits.
    await search.fill(toArabicIndic("90003"));
    await expect.poll(() => resultCount(page)).toBe(1);
    await expect(page.getByText("MS-90003").first()).toBeVisible();
  });

  test("each filter narrows to a consistent set of rows", async ({ page }) => {
    const doneIds = ["MS-90001", "MS-90005"];
    await signInWithDone(page, doneIds);
    await page.goto("/en/admin/");
    await expect.poll(() => resultCount(page)).toBe(SEED_COUNT);

    const completed = doneIds.length;
    const pending = SEED_COUNT - completed;
    const knet = SEED_ORDERS.filter((o) => o.method === "knet").length;

    const kpiCompleted = await readInt(page, "kpi-completed-value");

    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect.poll(() => resultCount(page)).toBe(completed);
    // The KPI tiles ignore the fulfilment filter.
    expect(await readInt(page, "kpi-completed-value")).toBe(kpiCompleted);

    await page.getByRole("button", { name: "Pending", exact: true }).click();
    await expect.poll(() => resultCount(page)).toBe(pending);

    await page.getByRole("button", { name: "All", exact: true }).first().click();

    await page.getByLabel("Period").selectOption("30d");
    const c30 = await resultCount(page);
    await page.getByLabel("Period").selectOption("7d");
    const c7 = await resultCount(page);
    expect(c7).toBeLessThanOrEqual(c30);
    expect(c30).toBeLessThanOrEqual(SEED_COUNT);
    expect(c30).toBeLessThan(SEED_COUNT); // the 40-day-old order is outside 30d
    await page.getByLabel("Period").selectOption("all");

    await page.getByLabel("Payment").selectOption("knet");
    await expect.poll(() => resultCount(page)).toBe(knet);
    await page.getByLabel("Payment").selectOption("all");

    // A search that matches nothing shows the empty state (the Source filter was removed).
    await page.getByTestId("orders-search").fill("no-such-order-xyz");
    await expect.poll(() => resultCount(page)).toBe(0);
    await expect(page.getByText("No orders match these filters.")).toBeVisible();
  });

  test("there is no Unpaid filter, no Delivery filter and no Confirming status", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/");
    await expect.poll(() => resultCount(page)).toBe(SEED_COUNT);

    // The fulfilment chips are only All / Pending / Done — no "Unpaid checkouts".
    await expect(page.getByRole("button", { name: "Unpaid checkouts" })).toHaveCount(0);
    // The delivery filter is gone entirely.
    await expect(page.getByLabel("Delivery")).toHaveCount(0);
    // Status chips are only Pending and Done — never Confirming, Unpaid, Failed or Canceled.
    const table = page.locator("table");
    await expect(table.getByText("Confirming", { exact: true })).toHaveCount(0);
    await expect(table.getByText("Unpaid", { exact: true })).toHaveCount(0);
    await expect(table.getByText(/^(Pending|Done)$/).first()).toBeVisible();
  });

  test("the Orders filters have no Source group, and no order carries a Sample tag", async ({ page }) => {
    await signIn(page);

    await page.goto("/en/admin/");
    await expect(page.getByTestId("order-row").first()).toBeVisible();
    // The Source filter chips were removed — every paid order is always listed.
    await expect(page.getByRole("group", { name: "Source" })).toHaveCount(0);
    // The demo "Sample" tag is gone with the sample machinery.
    await expect(page.getByText("Sample", { exact: true })).toHaveCount(0);

    await page.goto("/ar/admin/");
    await expect(page.getByTestId("order-row").first()).toBeVisible();
    await expect(page.getByRole("group", { name: "المصدر" })).toHaveCount(0);
  });

  test("marking a paid order done updates KPIs, survives reload and undoes", async ({ page }) => {
    // No pre-seeded fulfilment here: all orders start Pending and we mark one done through the UI.
    await signIn(page);
    await page.goto("/en/admin/");
    await expect.poll(() => resultCount(page)).toBe(SEED_COUNT);

    const beforeCompleted = await readInt(page, "kpi-completed-value");
    const beforePending = await readInt(page, "kpi-pending-value");
    const beforeRevenue = await readKwd(page, "kpi-revenue-value");

    await page.getByRole("button", { name: "Pending", exact: true }).click();
    const row = page
      .getByTestId("order-row")
      .filter({ has: page.locator("button:enabled", { hasText: "Mark done" }) })
      .first();
    await expect(row).toBeVisible();
    const orderId = (await row.getAttribute("data-order-id"))!;
    const total = Number(await row.getAttribute("data-total"));
    await row.getByRole("button", { name: "Mark done", exact: true }).click();

    await expect.poll(() => readInt(page, "kpi-completed-value")).toBe(beforeCompleted + 1);
    await expect.poll(() => readInt(page, "kpi-pending-value")).toBe(beforePending - 1);
    await expect.poll(() => readKwd(page, "kpi-revenue-value")).toBe(beforeRevenue + total);

    await page.reload();
    await expect.poll(() => readInt(page, "kpi-completed-value")).toBe(beforeCompleted + 1);

    await page.getByTestId("orders-search").fill(orderId);
    const sameRow = page.getByTestId("order-row").filter({ hasText: orderId }).first();
    await sameRow.getByRole("button", { name: "Undo", exact: true }).click();
    await page.getByTestId("orders-search").fill("");
    await expect.poll(() => readInt(page, "kpi-completed-value")).toBe(beforeCompleted);
  });

  test("the ?order= query opens that order's drawer", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/?order=MS-90001");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("MS-90001").first()).toBeVisible();
    await expect(dialog.getByText("Fatma Al-Kandari").first()).toBeVisible();
  });

  test("the order drawer no longer offers a WhatsApp link", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/?order=MS-90001");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/whatsapp/i)).toHaveCount(0);
    await expect(dialog.locator('a[href*="wa.me"]')).toHaveCount(0);
  });

  test("Excel export downloads a filtered .xlsx that unzips to an order id", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/");
    await expect.poll(() => resultCount(page)).toBe(SEED_COUNT);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("orders-export").click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^mystic-sand-orders-\d{4}-\d{2}-\d{2}\.xlsx$/);

    const buf = fs.readFileSync((await download.path())!);
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");

    const files = unzipSync(new Uint8Array(buf));
    const xml = Object.entries(files)
      .filter(([name]) => name.endsWith(".xml"))
      .map(([, data]) => strFromU8(data))
      .join("\n");
    expect(xml).toContain("MS-90001");
  });

  test("the Arabic export is right-to-left", async ({ page }) => {
    await signIn(page);
    await page.goto("/ar/admin/");
    await expect(page.getByTestId("order-row").first()).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("orders-export").click(),
    ]);
    const buf = fs.readFileSync((await download.path())!);
    const files = unzipSync(new Uint8Array(buf));
    const xml = Object.entries(files)
      .filter(([name]) => name.includes("worksheets"))
      .map(([, data]) => strFromU8(data))
      .join("\n");
    expect(xml).toContain('rightToLeft="1"');
  });

  test("the receipt downloads as a real PDF", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/?order=MS-90005");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      dialog.getByTestId("receipt-pdf").click(),
    ]);
    expect(download.suggestedFilename()).toBe("Mystic-Sand-Invoice-MS-90005.pdf");
    const buf = fs.readFileSync((await download.path())!);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // The invoice is embedded as a JPEG; a blank page would compress to a few KB.
    const body = buf.toString("latin1");
    expect(body).toContain("/DCTDecode");
    expect(buf.length).toBeGreaterThan(50_000);
    expect(buf.length).toBeLessThan(3_000_000);
  });

  test("an order is searchable by phone and its receipt downloads", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/");
    await expect.poll(() => resultCount(page)).toBe(SEED_COUNT);

    // Searchable by the full phone and by a partial.
    const search = page.getByTestId("orders-search");
    await search.fill("67095252");
    await expect.poll(() => resultCount(page)).toBe(1);
    await expect(page.getByText("MS-90005").first()).toBeVisible();
    await expect(page.getByText("Abdulaziz Al-Mutairi").first()).toBeVisible();

    await search.fill("6709");
    await expect(page.getByText("MS-90005").first()).toBeVisible();

    await page.goto("/en/admin/?order=MS-90005");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      dialog.getByTestId("receipt-pdf").click(),
    ]);
    expect(download.suggestedFilename()).toBe("Mystic-Sand-Invoice-MS-90005.pdf");
    const buf = fs.readFileSync((await download.path())!);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(50_000);
  });

  test("the storefront bundle contains no jsPDF or write-excel-file code", async ({ page }) => {
    await page.goto("/en/");
    const srcs = await page.evaluate(() =>
      Array.from(document.querySelectorAll("script[src]")).map((s) => (s as HTMLScriptElement).src),
    );
    expect(srcs.length).toBeGreaterThan(0);
    for (const src of srcs) {
      const res = await page.request.get(src);
      const text = await res.text();
      expect(text, src).not.toContain("jsPDF");
      expect(text, src).not.toContain("xl/workbook");
    }
  });
});

// ── Products admin ────────────────────────────────────────────────────────────
// Long flows on the desktop project. The far-future session opens the admin without signing in.

// A small 8×8 PNG, used for the upload flow (createImageBitmap can decode it).
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWM4UaGBFTEMLQkAUtVaAUH78mEAAAAASUVORK5CYII=",
  "base64",
);

test.describe("admin products", () => {
  test.skip(({ isMobile }) => isMobile, "Long flows run on the desktop project");

  test("adds a custom product that shows in the list, the store and the bag", async ({ page }) => {
    await signIn(page);
    try {
      await page.goto("/en/admin/products/");
      await page.getByTestId("products-add").click();
      await page.waitForURL(/\/admin\/products\/edit\//);

      await page.getByTestId("editor-name").fill("Amber Nights");
      await page.getByTestId("editor-category").selectOption("body");
      await page.getByTestId("editor-type-en").fill("All Over Spray");
      await page.getByTestId("editor-type-ar").fill("بخاخ معطّر للجسم");
      await page.getByTestId("editor-description-en").fill("A warm amber veil for skin, hair and clothes.");
      await page.getByTestId("editor-description-ar").fill("رذاذ عنبري دافئ للبشرة والشعر والملابس.");
      await page.getByTestId("editor-variant-size-en-0").fill("100 ml");
      await page.getByTestId("editor-variant-size-ar-0").fill("١٠٠ مل");
      await page.getByTestId("editor-variant-price-0").fill("9.500");
      await page.getByTestId("editor-variant-stock-0").fill("5");

      // One photo from the built-in site library.
      await page.getByTestId("editor-add-library").click();
      await page.getByTestId("library-item").first().click();
      await page.getByTestId("library-add").click();
      await expect(page.getByTestId("editor-photos").locator("li")).toHaveCount(1);

      await page.getByTestId("editor-save").click();
      await page.waitForURL(/\/admin\/products\/$/);

      const row = page.getByTestId("product-row").filter({ hasText: "Amber Nights" });
      await expect(row).toHaveCount(1);
      await expect(row.getByText("Custom", { exact: true })).toBeVisible();

      // The storefront collection, the custom-product link and the product page.
      await page.goto("/en/shop/body/");
      await expect(page.getByText("2 products")).toBeVisible();
      const card = page.locator("article").filter({ hasText: "Amber Nights" });
      await expect(card).toHaveCount(1);
      const link = card.locator('a[href*="?p=c-"]').first();
      await expect(link).toHaveCount(1);
      const href = (await link.getAttribute("href"))!;
      expect(href).toMatch(/\/en\/product\/\?p=c-/);

      await page.goto(href);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Amber Nights");
      await expect(page.getByText("KWD 9.500").first()).toBeVisible();

      await page.getByRole("button", { name: "Add to bag", exact: true }).first().click();
      await expect(page.getByRole("dialog").getByText("KWD 11.500")).toBeVisible(); // 9.500 + 2.000 delivery
    } finally {
      // Delete the custom product (exercises deleteProduct) so the shared DB is left clean.
      await page.goto("/en/admin/products/");
      await expect(page.getByTestId("products-add")).toBeVisible(); // wait for the list to hydrate
      const del = page
        .getByTestId("product-row")
        .filter({ hasText: "Amber Nights" })
        .getByRole("button", { name: "Delete Amber Nights", exact: true });
      if (await del.count()) {
        await del.click();
        await page.getByTestId("confirm-accept").click();
        await expect(page.getByTestId("product-row").filter({ hasText: "Amber Nights" })).toHaveCount(0);
      }
    }
  });

  test("uploads a photo that posts to the server, renders, and serves from /api/images", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/products/edit/?p=new");

    // The upload POSTs the file to the server, which re-encodes + stores it and returns a u:<id> key.
    const [upload] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/admin/images/") && r.request().method() === "POST"),
      page
        .getByTestId("editor-upload-input")
        .setInputFiles({ name: "shot.png", mimeType: "image/png", buffer: TINY_PNG }),
    ]);
    expect(upload.status()).toBe(200);
    const body = (await upload.json()) as { key: string; url: string };
    expect(body.key).toMatch(/^u:/);

    // It shows in the editor gallery and the live preview.
    await expect(page.getByTestId("editor-photos").locator("li")).toHaveCount(1);
    await expect(page.getByTestId("editor-preview").locator("img")).toHaveCount(1);

    // The gallery <img> points at the serving route, and that returns the stored (webp) image.
    const src = await page.getByTestId("editor-photos").locator("img").first().getAttribute("src");
    expect(src).toContain("/api/images/");
    const served = await page.request.get(src!);
    expect(served.status()).toBe(200);
    expect(served.headers()["content-type"]).toContain("image/webp");
  });

  test("an uploaded photo joins the reusable library and shows for another product after reload", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/products/edit/?p=new");

    const [upload] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/admin/images/") && r.request().method() === "POST"),
      page
        .getByTestId("editor-upload-input")
        .setInputFiles({ name: "shot.png", mimeType: "image/png", buffer: TINY_PNG }),
    ]);
    const { key } = (await upload.json()) as { key: string };
    await expect(page.getByTestId("editor-photos").locator("li")).toHaveCount(1);

    // Reload into a fresh product; the upload persists server-side and shows under "Your uploads".
    await page.reload();
    await page.getByTestId("editor-add-library").click();
    await expect(page.getByTestId("library-uploads").locator(`[data-key="${key}"]`)).toBeVisible();
  });

  test("the editor's related search finds a custom product", async ({ page }) => {
    test.skip(true, "Phase 8 E2E rewrite: data is server-fed from the DB now (localStorage ms-catalog seeding no longer reaches the storefront).");
    await signIn(page);
    await page.addInitScript((product) => {
      localStorage.setItem(
        "ms-catalog",
        JSON.stringify({ state: { edits: { patches: {}, added: [product], categories: {} } }, version: 1 }),
      );
    }, CUSTOM_PRODUCT("c-related-search-aaaa", "Zephyr Nights", "renders/aura", "MS-ZEPHYR"));

    await page.goto("/en/admin/products/edit/?p=i");
    const search = page.getByTestId("editor-related-search");
    await expect(search).toBeVisible();
    // The custom product (added to the live catalog) is found by the related search.
    await search.fill("Zephyr");
    await expect(page.getByText("Zephyr Nights")).toBeVisible();
    // A non-matching query filters it back out.
    await search.fill("zzqqxx-nothing");
    await expect(page.getByText("Zephyr Nights")).toHaveCount(0);
  });

  test("editing a base product's price flows to the store and resets", async ({ page }) => {
    await signIn(page);
    try {
      await page.goto("/en/admin/products/edit/?p=i");
      const price = page.getByTestId("editor-variant-price-0");
      await expect(price).toHaveValue("19.000");
      await price.fill("21.000");
      await page.getByTestId("editor-save").click();
      await page.waitForURL(/\/admin\/products\/$/);

      // The list (server-fed live catalog) reflects it straight after the redirect — no reload — and
      // the product is now flagged Edited with a Reset affordance (isProductEdited vs the seed).
      const row = page.locator('[data-testid="product-row"][data-slug="i"]');
      await expect(row.getByText("KWD 21.000")).toBeVisible();
      await expect(row.getByText("Edited", { exact: true })).toBeVisible();

      // The storefront reflects it; the gallery is untouched (photos weren't edited → still 5 images).
      await expect(async () => {
        await page.goto("/en/product/i/");
        await expect(page.getByText("KWD 21.000").first()).toBeVisible({ timeout: 2000 });
      }).toPass({ timeout: 20000 });
      await expect(page.getByTestId("gallery-counter")).toHaveText("1 / 5");

      // The shop-grid card and the bag total reflect the new price too.
      await page.goto("/en/shop/perfumes/");
      await expect(page.locator('article:has(a[href$="/product/i/"])').getByText("KWD 21.000")).toBeVisible();
      await page.goto("/en/product/i/");
      await page.getByRole("button", { name: "Add to bag", exact: true }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByRole("dialog").getByText("KWD 23.000")).toBeVisible(); // 21.000 + 2.000 delivery
      await page.keyboard.press("Escape");

      // Reset from the list restores the original price.
      await page.goto("/en/admin/products/");
      await page
        .locator('[data-testid="product-row"][data-slug="i"]')
        .getByRole("button", { name: "Reset I", exact: true })
        .click();
      await page.getByTestId("confirm-accept").click();

      await expect(async () => {
        await page.goto("/en/product/i/");
        await expect(page.getByText("KWD 19.000").first()).toBeVisible({ timeout: 2000 });
      }).toPass({ timeout: 20000 });
    } finally {
      // Ensure I is at the seed price even if an assertion above failed mid-way.
      await page.goto("/en/admin/products/");
      await expect(page.getByTestId("products-add")).toBeVisible(); // wait for the list to hydrate
      const resetBtn = page
        .locator('[data-testid="product-row"][data-slug="i"]')
        .getByRole("button", { name: "Reset I", exact: true });
      if (await resetBtn.count()) {
        await resetBtn.click();
        await page.getByTestId("confirm-accept").click();
        await expect(resetBtn).toHaveCount(0);
      }
    }
  });

  test("moving a product to another collection from the list updates both", async ({ page }) => {
    await signIn(page);
    try {
      await page.goto("/en/admin/products/");
      await page.getByLabel("Collection for AURA", { exact: true }).selectOption("home");
      // Wait for the write to land (the toast shows after the Server Action + refresh resolve).
      await expect(page.getByText("Moved AURA to Home.")).toBeVisible();

      await page.goto("/en/shop/body/");
      await expect(page.getByText("Nothing here yet — explore the other collections.")).toBeVisible();

      await page.goto("/en/shop/home/");
      await expect(page.getByText("4 products")).toBeVisible();
    } finally {
      await page.goto("/en/admin/products/");
      await expect(page.getByTestId("products-add")).toBeVisible(); // wait for the list to hydrate
      const resetBtn = page
        .locator('[data-testid="product-row"][data-slug="aura"]')
        .getByRole("button", { name: "Reset AURA", exact: true });
      if (await resetBtn.count()) {
        await resetBtn.click();
        await page.getByTestId("confirm-accept").click();
        await expect(resetBtn).toHaveCount(0);
      }
    }
  });

  test("hiding a product removes it from the store and shows a Hidden badge", async ({ page }) => {
    await signIn(page);
    try {
      await page.goto("/en/admin/products/");
      const row = page.locator('[data-testid="product-row"][data-slug="mist"]');
      await row.getByRole("button", { name: "Hide Mist", exact: true }).click();
      await expect(row.getByText("Hidden", { exact: true })).toBeVisible();

      await page.goto("/en/shop/home/");
      await expect(page.getByText("2 products")).toBeVisible();
      await expect(page.locator("article").filter({ hasText: "Mist" })).toHaveCount(0);

      // Search never surfaces the hidden product (other products list "mist" as a term; Mist is gone).
      await page.getByRole("button", { name: "Search", exact: true }).first().click();
      const dialog = page.getByRole("dialog");
      await page.getByRole("searchbox").fill("mist");
      await expect(dialog.getByRole("status")).toBeVisible();
      await expect(dialog.locator('a[href$="/product/mist/"]')).toHaveCount(0);
      await page.keyboard.press("Escape");

      // Its own product page is gone too.
      await page.goto("/en/product/mist/");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("No longer available");

      // Show restores it.
      await page.goto("/en/admin/products/");
      const again = page.locator('[data-testid="product-row"][data-slug="mist"]');
      await again.getByRole("button", { name: "Show Mist", exact: true }).click();
      await expect(again.getByText("Visible", { exact: true })).toBeVisible();
      await page.goto("/en/shop/home/");
      await expect(page.getByText("3 products")).toBeVisible();
    } finally {
      // Make sure Mist is visible again for the other specs.
      await page.goto("/en/admin/products/");
      await expect(page.getByTestId("products-add")).toBeVisible(); // wait for the list to hydrate
      const show = page
        .locator('[data-testid="product-row"][data-slug="mist"]')
        .getByRole("button", { name: "Show Mist", exact: true });
      if (await show.count()) {
        await show.click();
        await expect(
          page.locator('[data-testid="product-row"][data-slug="mist"]').getByText("Visible", { exact: true }),
        ).toBeVisible();
      }
    }
  });

  test("deleting a custom product removes it from the list and the store", async ({ page }) => {
    test.skip(true, "Phase 8 E2E rewrite: data is server-fed from the DB now (localStorage ms-catalog seeding no longer reaches the storefront).");
    await signIn(page);
    await page.addInitScript(() => {
      const product = {
        slug: "c-test-delete-xyz9",
        name: "Test Delete",
        category: "body",
        type: { en: "All Over Spray", ar: "بخاخ معطّر للجسم" },
        tagline: { en: "A test.", ar: "اختبار." },
        description: { en: "A test product.", ar: "منتج تجريبي." },
        howTo: { en: "Spray.", ar: "رشّ." },
        variants: [{ sku: "MS-DELTST", size: { en: "100 ml", ar: "100 مل" }, priceFils: 5000, stock: 3 }],
        images: { card: "renders/aura", gallery: ["renders/aura"] },
        related: [],
        aliases: [],
        todo: [],
      };
      localStorage.setItem(
        "ms-catalog",
        JSON.stringify({ state: { edits: { patches: {}, added: [product], categories: {} } }, version: 1 }),
      );
    });

    await page.goto("/en/admin/products/");
    const row = page.locator('[data-testid="product-row"][data-slug="c-test-delete-xyz9"]');
    await expect(row).toHaveCount(1);
    await row.getByRole("button", { name: "Delete Test Delete", exact: true }).click();
    await page.getByTestId("confirm-accept").click();

    await expect(page.locator('[data-testid="product-row"][data-slug="c-test-delete-xyz9"]')).toHaveCount(0);
    const added = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem("ms-catalog") || "{}");
      return (raw.state?.edits?.added ?? []).length;
    });
    expect(added).toBe(0);
  });

  test("editing a collection name shows across the store and resets", async ({ page }) => {
    await signIn(page);
    try {
      await page.goto("/en/admin/products/");
      await page.getByTestId("collection-home-name-en").fill("Home & Living");
      await page.getByTestId("collection-home-save").click();
      await expect(page.getByText("Home & Living collection saved.")).toBeVisible();

      await expect(async () => {
        await page.goto("/en/shop/home/");
        await expect(page.getByRole("heading", { level: 1 })).toHaveText("Home & Living", { timeout: 2000 });
      }).toPass({ timeout: 20000 });

      await page.goto("/en/admin/products/");
      await page.getByTestId("collection-home-reset").click();
      await expect(page.getByText("Home collection restored.")).toBeVisible();

      await expect(async () => {
        await page.goto("/en/shop/home/");
        await expect(page.getByRole("heading", { level: 1 })).toHaveText("Home", { timeout: 2000 });
      }).toPass({ timeout: 20000 });
    } finally {
      // Ensure the Home collection name is back to the seed even if an assertion failed mid-way.
      await page.goto("/en/admin/products/");
      await expect(page.getByTestId("products-add")).toBeVisible(); // wait for the list to hydrate
      if ((await page.getByTestId("collection-home-name-en").inputValue()) !== "Home") {
        await page.getByTestId("collection-home-reset").click();
        await expect(page.getByText("Home collection restored.")).toBeVisible();
      }
    }
  });

  test("saving with no name or price shows field errors without crashing", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/products/edit/?p=new");
    await page.getByTestId("editor-save").click();

    await expect(page.getByText("Enter a name.")).toBeVisible();
    await expect(page.getByText("Enter the type.").first()).toBeVisible();
    await expect(page.getByText("Enter a description.").first()).toBeVisible();
    await expect(page.getByText("Enter the size.").first()).toBeVisible();
    await expect(page.getByText("Enter a price between 0 and 1000, up to 3 decimals.")).toBeVisible();
    await expect(page.getByTestId("editor-photos-error")).toBeVisible();

    // Still on the editor — no navigation, no crash.
    await expect(page).toHaveURL(/\/admin\/products\/edit\//);
  });

  test("the editor opens without console errors (new and existing, EN and AR)", async ({ page }) => {
    await signIn(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });
    for (const url of [
      "/en/admin/products/edit/?p=new",
      "/ar/admin/products/edit/?p=new",
      "/en/admin/products/edit/?p=i",
      "/ar/admin/products/edit/?p=i",
    ]) {
      await page.goto(url, { waitUntil: "networkidle" });
      await expect(page.getByTestId("editor-save")).toBeVisible();
      await page.waitForTimeout(400);
    }
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("the editor shows a not-found message for an unknown product", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/products/edit/?p=does-not-exist");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Product not found");
    await expect(page.getByRole("link", { name: "Back to products" })).toBeVisible();
  });
});

// ── Product analysis ──────────────────────────────────────────────────────────
// Long flows on the desktop project. The analysis reads the same real paid DB orders the dashboard
// does (seeded in beforeEach), so the per-product unit counts are derived from SEED_ORDERS.

const section = (page: Page, slug: string) =>
  page.locator(`[data-testid="analysis-section"][data-slug="${slug}"]`);
const sectionRows = (page: Page, slug: string) =>
  section(page, slug).locator('[data-testid="analysis-row"]');

/** Units ordered per product slug across the seeded orders. */
function seededUnitsBySlug(): Record<string, number> {
  const units: Record<string, number> = {};
  for (const o of SEED_ORDERS) for (const l of o.lines ?? []) units[l.slug] = (units[l.slug] ?? 0) + l.qty;
  return units;
}

test.describe("admin product analysis", () => {
  test.skip(({ isMobile }) => isMobile, "Long flows run on the desktop project");
  test.beforeEach(seedOrders);
  test.afterEach(() => clearOrders());

  test("groups products by collection, with OUD in two collections and matching unit counts", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/analysis/");
    // Section rows are catalog-driven (every product is listed, zero-sales included).
    await expect.poll(() => sectionRows(page, "perfumes").count()).toBe(5);
    await expect(sectionRows(page, "oud")).toHaveCount(2);
    await expect(sectionRows(page, "body")).toHaveCount(1);
    await expect(sectionRows(page, "home")).toHaveCount(3);

    const unitsBySlug = seededUnitsBySlug();

    // OUD is listed under both Perfumes and Oud, with the same (joined-by-slug) unit count.
    const perfOud = section(page, "perfumes").locator('[data-testid="analysis-row"][data-slug="oud"]');
    const oudOud = section(page, "oud").locator('[data-testid="analysis-row"][data-slug="oud"]');
    await expect(perfOud).toHaveCount(1);
    await expect(oudOud).toHaveCount(1);
    const oudUnits = String(unitsBySlug["oud"] ?? 0);
    expect(await perfOud.getAttribute("data-units")).toBe(oudUnits);
    expect(await oudOud.getAttribute("data-units")).toBe(oudUnits);

    // The "Also in" note names the OTHER collections relative to the section it sits in.
    await expect(perfOud).toContainText("Also in Oud");
    await expect(oudOud).toContainText("Also in Perfumes");

    // Every ordered product's row shows exactly the sum of its seeded line quantities.
    for (const slug of Object.keys(unitsBySlug)) {
      const row = page.locator(`[data-testid="analysis-row"][data-slug="${slug}"]`).first();
      expect(await row.getAttribute("data-units"), slug).toBe(String(unitsBySlug[slug]));
    }

    // Section totals add up from their rows.
    for (const slug of ["perfumes", "oud", "body", "home"]) {
      const rows = sectionRows(page, slug);
      const count = await rows.count();
      let sum = 0;
      for (let i = 0; i < count; i++) sum += Number(await rows.nth(i).getAttribute("data-units"));
      const total = Number(await section(page, slug).getAttribute("data-units"));
      expect(sum, slug).toBe(total);
    }
  });

  test("search narrows to the matching products and a nonsense query shows the empty state", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/analysis/");
    await expect.poll(() => sectionRows(page, "perfumes").count()).toBe(5);

    const search = page.getByTestId("analysis-search");
    await search.fill("oud");
    // OUD (name + SKU) and Natural Oud Chips (name) only.
    await expect.poll(() => sectionRows(page, "oud").count()).toBe(2);
    await expect(section(page, "oud").locator('[data-testid="analysis-row"][data-slug="oud-chips"]')).toHaveCount(1);
    await expect(section(page, "perfumes").locator('[data-testid="analysis-row"]')).toHaveCount(1);
    await expect(section(page, "perfumes").locator('[data-testid="analysis-row"][data-slug="oud"]')).toHaveCount(1);

    await search.fill("zzqqxx-nothing");
    await expect(page.getByTestId("analysis-empty")).toBeVisible();
    await expect(page.locator('[data-testid="analysis-section"]')).toHaveCount(0);
  });

  test("completed-only never raises units and the 7-day period never raises them either", async ({ page }) => {
    const doneIds = ["MS-90001", "MS-90005"];
    await signInWithDone(page, doneIds);
    await page.goto("/en/admin/analysis/");
    await expect.poll(() => sectionRows(page, "perfumes").count()).toBe(5);

    const expectedDoneUnits = SEED_ORDERS.filter((o) => doneIds.includes(o.id)).reduce(
      (n, o) => n + orderUnits(o),
      0,
    );

    const allUnits = await readInt(page, "kpi-analysis-units-value");

    await page.getByTestId("analysis-completed").check();
    const doneUnits = await readInt(page, "kpi-analysis-units-value");
    expect(doneUnits).toBeLessThanOrEqual(allUnits);
    expect(doneUnits).toBe(expectedDoneUnits);

    await page.getByTestId("analysis-completed").uncheck();
    await page.getByLabel("Period").selectOption("7d");
    const weekUnits = await readInt(page, "kpi-analysis-units-value");
    expect(weekUnits).toBeLessThanOrEqual(allUnits);
  });

  test("a per-category export downloads an .xlsx that unzips to one of its products", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/analysis/");
    await expect.poll(() => sectionRows(page, "perfumes").count()).toBe(5);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("analysis-export-perfumes").click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^mystic-sand-perfumes-\d{4}-\d{2}-\d{2}\.xlsx$/);

    const buf = fs.readFileSync((await download.path())!);
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
    const files = unzipSync(new Uint8Array(buf));
    const xml = Object.entries(files)
      .filter(([name]) => name.endsWith(".xml"))
      .map(([, data]) => strFromU8(data))
      .join("\n");
    expect(xml).toContain("III"); // a Perfumes product
  });

  test("the all-collections export has a Summary, four collection sheets and All products", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/analysis/");
    await expect.poll(() => sectionRows(page, "perfumes").count()).toBe(5);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("analysis-export-all").click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^mystic-sand-products-\d{4}-\d{2}-\d{2}\.xlsx$/);

    const buf = fs.readFileSync((await download.path())!);
    const files = unzipSync(new Uint8Array(buf));
    const workbook = strFromU8(files["xl/workbook.xml"]);
    for (const name of ["Summary", "Perfumes", "Oud", "Body", "Home", "All products"]) {
      expect(workbook, name).toContain(`name="${name}"`);
    }
  });

  test("the Arabic analysis export is right-to-left", async ({ page }) => {
    await signIn(page);
    await page.goto("/ar/admin/analysis/");
    await expect.poll(() => sectionRows(page, "perfumes").count()).toBe(5);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("analysis-export-all").click(),
    ]);
    const buf = fs.readFileSync((await download.path())!);
    const files = unzipSync(new Uint8Array(buf));
    const xml = Object.entries(files)
      .filter(([name]) => name.includes("worksheets"))
      .map(([, data]) => strFromU8(data))
      .join("\n");
    expect(xml).toContain('rightToLeft="1"');
  });

  test("a store product shows under its collection and an unknown slug goes to Removed", async ({ page }) => {
    // One extra DB order (on top of the beforeEach seed): a real catalog line (iii) and a line whose
    // slug is not in the catalog (ghost-product), which must surface in the Removed table.
    await insertPaidOrder({
      id: "MS-90007",
      name: "Analysis Tester",
      phone: "99001122",
      method: "knet",
      locale: "en",
      lines: [
        { sku: "MS-III-50", slug: "iii", name: "III", qty: 1, priceFils: 19000 },
        { sku: "MS-GHOST", slug: "ghost-product", name: "Ghosted Scent", qty: 2, priceFils: 5000 },
      ],
    });

    await signIn(page);
    await page.goto("/en/admin/analysis/");
    await expect.poll(() => sectionRows(page, "perfumes").count()).toBe(5);

    // A catalog product (III) is listed under its collection (Perfumes).
    const perfRow = section(page, "perfumes").locator('[data-testid="analysis-row"][data-slug="iii"]');
    await expect(perfRow).toHaveCount(1);

    // The unknown slug lands in the Removed table, named from the order's line snapshot, units = 2.
    const removed = page.locator('[data-testid="analysis-removed-row"][data-slug="ghost-product"]');
    await expect(removed).toHaveCount(1);
    await expect(removed.getByText("Ghosted Scent")).toBeVisible();
    expect(await removed.getAttribute("data-units")).toBe("2");
  });

  test("product analysis has no Source filter", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/analysis/");
    await expect(page.getByTestId("kpi-analysis-units-value")).toBeVisible();
    // The Source select (site/sample) is gone — analysis always covers all orders.
    await expect(page.locator("#analysis-source")).toHaveCount(0);
  });

  test("the analysis page opens without console errors in English and Arabic", async ({ page }) => {
    await signIn(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });
    for (const url of ["/en/admin/analysis/", "/ar/admin/analysis/"]) {
      await page.goto(url, { waitUntil: "networkidle" });
      await expect(page.getByTestId("kpi-analysis-units-value")).toBeVisible();
      await page.waitForTimeout(400);
    }
    expect(errors, errors.join("\n")).toEqual([]);
  });
});

// ── Store settings ──────────────────────────────────────────────────────────────
// Long flows on the desktop project. Settings are stored in the DB settings singleton (saved per
// field via the saveSettings Server Action); the storefront (bag, FAQ, footer, contact, banner)
// reads them server-side, and updateTag("settings") makes a save read-your-own-writes.

const CUSTOM_PRODUCT = (slug: string, name: string, imageKey: string, sku: string) => ({
  slug,
  name,
  category: "body",
  type: { en: "All Over Spray", ar: "بخاخ معطّر للجسم" },
  tagline: { en: "A test.", ar: "اختبار." },
  description: { en: "A test product.", ar: "منتج تجريبي." },
  howTo: { en: "Spray.", ar: "رشّ." },
  variants: [{ sku, size: { en: "100 ml", ar: "100 مل" }, priceFils: 5000, stock: 3 }],
  images: { card: imageKey, gallery: [imageKey] },
  related: [],
  aliases: [],
  todo: [],
});

test.describe("admin store settings", () => {
  test.skip(({ isMobile }) => isMobile, "Long flows run on the desktop project");

  test("settings shows a single delivery fee field", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/settings/");
    await expect(page.getByTestId("settings-standard-fee")).toBeVisible();
    // The old separate express-fee field is gone.
    await expect(page.getByTestId("settings-express-fee")).toHaveCount(0);
  });

  test("a delivery fee of 1.500 flows to the bag and FAQ, then resets to 2.000", async ({ page }) => {
    await signIn(page);
    try {
      await page.goto("/en/admin/settings/");
      const standard = page.getByTestId("settings-standard-fee");
      await expect(standard).toHaveValue("2.000");
      await standard.fill("1.500");
      await page.getByTestId("settings-fee-save").click();
      await expect(page.getByText("Saved.").first()).toBeVisible();

      // Read-your-own-writes: the admin's own "In use" line updates via router.refresh() with no
      // navigation and no polling — proving updateTag purged the settings read immediately
      // (not stale-while-revalidate, which this assertion would fail).
      await expect(page.getByText("KWD 1.500").first()).toBeVisible();

      // The FAQ copy reads the live (DB) fee. saveSettings calls updateTag("settings"); reload
      // until the storefront read reflects it (idempotent, so safe to repeat).
      await expect(async () => {
        await page.goto("/en/faq/");
        await page.getByRole("button", { name: "How much does delivery cost?" }).click();
        await expect(page.getByText("KWD 1.500").first()).toBeVisible({ timeout: 2000 });
      }).toPass({ timeout: 20000 });

      // The bag's delivery line uses the same live fee.
      await page.goto("/en/product/i/");
      await page.getByRole("button", { name: "Add to bag", exact: true }).first().click();
      await expect(page.getByRole("dialog").getByText("KWD 1.500")).toBeVisible();
    } finally {
      // Reset to default through the admin (saveSettings → updateTag), leaving the shared DB clean.
      await page.goto("/en/admin/settings/");
      await page.getByTestId("settings-standard-reset").click();
      await expect(page.getByTestId("settings-standard-fee")).toHaveValue("2.000");
    }
    await expect(async () => {
      await page.goto("/en/faq/");
      await page.getByRole("button", { name: "How much does delivery cost?" }).click();
      await expect(page.getByText("KWD 2.000").first()).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20000 });
  });

  test("a new WhatsApp number flows to the footer link", async ({ page }) => {
    await signIn(page);
    try {
      await page.goto("/en/admin/settings/");
      await page.getByTestId("settings-whatsapp").fill("91234567");
      await page.getByTestId("settings-contact-save").click();
      await expect(page.getByText("Saved.").first()).toBeVisible();

      // Read-your-own-writes: the admin's own "Shown as" line reflects the new number without
      // navigating — proving the settings read was purged immediately, not served stale.
      await expect(page.getByText("+965 9123 4567")).toBeVisible();

      // The footer link reads the live (DB) WhatsApp number; reload until it reflects the save.
      await expect(async () => {
        await page.goto("/en/");
        await expect(page.locator('footer a[href*="wa.me"]')).toHaveAttribute("href", /wa\.me\/96591234567/, {
          timeout: 2000,
        });
      }).toPass({ timeout: 20000 });
      await expect(page.locator("footer").getByText("+965 9123 4567")).toBeVisible();
    } finally {
      await page.goto("/en/admin/settings/");
      await page.getByTestId("settings-whatsapp-reset").click();
      await expect(page.getByText("Saved.").first()).toBeVisible();
    }
  });

  test("an invalid WhatsApp number shows an error and saves nothing", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/settings/");
    await page.getByTestId("settings-whatsapp").fill("22223333"); // a landline, not a mobile
    await page.getByTestId("settings-contact-save").click();
    await expect(page.getByText("Enter a valid Kuwaiti mobile number.")).toBeVisible();

    // The client blocks the save (no server call), so the storefront keeps the default numbers
    // (the default WhatsApp and phone both render as +965 9932 5773, hence .first()).
    await page.goto("/en/");
    await expect(page.locator("footer").getByText("+965 9932 5773").first()).toBeVisible();
  });

  test("a new phone number flows to the footer and the contact page", async ({ page }) => {
    await signIn(page);
    try {
      await page.goto("/en/admin/settings/");
      await page.getByTestId("settings-phone").fill("22223333");
      await page.getByTestId("settings-contact-save").click();
      await expect(page.getByText("Saved.").first()).toBeVisible();

      await expect(async () => {
        await page.goto("/en/");
        await expect(page.locator("footer").getByText("+965 2222 3333")).toBeVisible({ timeout: 2000 });
      }).toPass({ timeout: 20000 });
      await page.goto("/en/contact/");
      await expect(page.getByText("+965 2222 3333").first()).toBeVisible();
    } finally {
      await page.goto("/en/admin/settings/");
      await page.getByTestId("settings-phone-reset").click();
      await expect(page.getByText("Saved.").first()).toBeVisible();
    }
  });

  // The top-banner (ticker) editor moved to the Home page editor — see home-editor.spec.ts.

  test("the default login works with MysticSand@2026 and the old password fails", async ({ page }) => {
    test.skip(true, "Phase 4: sign-in rewritten (argon2 + session cookie) — see auth.spec.ts");
    await page.goto("/en/");
    await page.getByRole("button", { name: "Enter", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Username", { exact: true }).fill(ADMIN_USER);

    // The old default no longer works.
    await dialog.getByLabel("Password", { exact: true }).fill(OLD_ADMIN_PASS);
    await dialog.getByRole("button", { name: "Sign in" }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();

    // The new default does.
    await dialog.getByLabel("Password", { exact: true }).fill(ADMIN_PASS);
    await dialog.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/en\/admin\/$/);
  });

  test("the username is changed in its own card, with the current password", async ({ page }) => {
    test.skip(true, "Phase 4: the username-change card was removed with the browser-only gate");
    await signIn(page);
    await page.goto("/en/admin/settings/");

    // A wrong current password is rejected.
    await page.getByTestId("account-username-current").fill("not-the-password");
    await page.getByTestId("account-username").fill("admin2");
    await page.getByTestId("account-username-save").click();
    await expect(page.getByText("That current password is not correct.")).toBeVisible();

    // The correct current password applies the change.
    await page.getByTestId("account-username-current").fill(ADMIN_PASS);
    await page.getByTestId("account-username-save").click();
    await expect(page.getByText("Username updated.")).toBeVisible();
  });

  test("the password checklist enforces the strong rule and only the new password works", async ({ page }) => {
    test.skip(true, "Phase 4: changePassword now rotates the shared DB admin (would poison other specs) — see auth.spec.ts");
    // A real UI sign-in (no injected session) so the log-out step actually clears it.
    await page.goto("/en/");
    await page.getByRole("button", { name: "Enter", exact: true }).click();
    const signInDialog = page.getByRole("dialog");
    await signInDialog.getByLabel("Username", { exact: true }).fill(ADMIN_USER);
    await signInDialog.getByLabel("Password", { exact: true }).fill(ADMIN_PASS);
    await signInDialog.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/en\/admin\/$/);

    await page.goto("/en/admin/settings/");
    const save = page.getByTestId("account-password-save");
    await page.getByTestId("account-password-current").fill(ADMIN_PASS);

    // A weak password fails every rule and blocks saving.
    await page.getByTestId("account-new").fill("weak");
    await expect(page.getByTestId("rule-length")).toHaveAttribute("data-met", "false");
    await expect(page.getByTestId("rule-special")).toHaveAttribute("data-met", "false");
    await expect(save).toBeDisabled();

    // Missing only a special character still blocks saving.
    await page.getByTestId("account-new").fill("Password1");
    await expect(page.getByTestId("rule-special")).toHaveAttribute("data-met", "false");
    await expect(save).toBeDisabled();

    // A strong password ticks every rule; saving still waits for the confirmation to match.
    await page.getByTestId("account-new").fill("Password@1");
    for (const rule of ["rule-length", "rule-upper", "rule-number", "rule-special"]) {
      await expect(page.getByTestId(rule)).toHaveAttribute("data-met", "true");
    }
    await expect(save).toBeDisabled();
    await page.getByTestId("account-confirm").fill("Password@1");
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByText("Password updated.")).toBeVisible();

    // Log out, then only the new password works.
    await page.getByRole("button", { name: "Log out" }).click();
    await page.waitForURL(/\/en\/$/);
    await page.getByRole("button", { name: "Enter", exact: true }).click();
    const back = page.getByRole("dialog");
    await back.getByLabel("Username", { exact: true }).fill(ADMIN_USER);
    await back.getByLabel("Password", { exact: true }).fill(ADMIN_PASS);
    await back.getByRole("button", { name: "Sign in" }).click();
    await expect(back.getByRole("alert")).toBeVisible();

    await back.getByLabel("Password", { exact: true }).fill("Password@1");
    await back.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/en\/admin\/$/);
  });

  test("the settings page opens without console errors in English and Arabic", async ({ page }) => {
    await signIn(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });
    for (const url of ["/en/admin/settings/", "/ar/admin/settings/"]) {
      await page.goto(url, { waitUntil: "networkidle" });
      await expect(page.getByTestId("settings-fee-save")).toBeVisible();
      await page.waitForTimeout(400);
    }
    expect(errors, errors.join("\n")).toEqual([]);
  });
});

// ── Storefront catalog exposure (A01) ───────────────────────────────────────────
// The storefront read (getCatalogData) omits hidden products entirely and strips the internal `todo`
// notes, so an anonymous RSC payload carries neither. The admin read (getAdminCatalogData) keeps both.

test.describe("storefront catalog exposure (A01)", () => {
  test.skip(({ isMobile }) => isMobile, "Long flows run on the desktop project");

  test("the storefront payload omits the internal todo notes and hidden products; the admin keeps them", async ({
    page,
  }) => {
    await signIn(page);

    // The storefront LiveProvider ships the SAME hidden-stripped, todo-free catalog to everyone, so
    // the payload shape does not depend on auth — this fetch stands in for an anonymous visitor.
    const home = await (await page.request.get("/en/")).text();
    // The internal review notes key never appears in the storefront payload.
    expect(home).not.toContain("todo");
    // Mist is a visible product, so its SKU IS in the live payload right now.
    expect(home).toContain("MS-MIST-250");

    try {
      // Hide Mist through the admin; the admin product list STILL shows it (full admin catalog).
      await page.goto("/en/admin/products/");
      const row = page.locator('[data-testid="product-row"][data-slug="mist"]');
      await row.getByRole("button", { name: "Hide Mist", exact: true }).click();
      await expect(row.getByText("Hidden", { exact: true })).toBeVisible();
      await expect(row).toBeVisible();

      // The anonymous storefront payload no longer carries the hidden product at all (A01) — and
      // still no todo. setHidden purges the cached read (updateTag), so reload until it reflects.
      await expect(async () => {
        const after = await (await page.request.get("/en/")).text();
        expect(after).not.toContain("MS-MIST-250");
        expect(after).not.toContain("todo");
      }).toPass({ timeout: 20000 });
    } finally {
      // Restore Mist's visibility for the rest of the suite.
      await page.goto("/en/admin/products/");
      await expect(page.getByTestId("products-add")).toBeVisible();
      const show = page
        .locator('[data-testid="product-row"][data-slug="mist"]')
        .getByRole("button", { name: "Show Mist", exact: true });
      if (await show.count()) {
        await show.click();
        await expect(
          page.locator('[data-testid="product-row"][data-slug="mist"]').getByText("Visible", { exact: true }),
        ).toBeVisible();
      }
    }
  });
});

// ── Stale-data refresher ────────────────────────────────────────────────────────
// A visibilitychange → router.refresh() refresher is mounted on the shop + checkout layouts (so an
// open storefront tab picks up an admin edit when the shopper returns), but NEVER on the admin.

test.describe("stale-data refresher", () => {
  test.skip(({ isMobile }) => isMobile, "Long flows run on the desktop project");

  const fireVisible = (page: Page): Promise<void> =>
    page.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

  // Counts the NON-prefetch RSC requests (what router.refresh() issues) during the trigger window.
  async function countRscOn(page: Page, trigger: () => Promise<void>): Promise<number> {
    let count = 0;
    const onReq = (req: Request) => {
      const h = req.headers();
      if (h["rsc"] === "1" && h["next-router-prefetch"] !== "1") count++;
    };
    page.on("request", onReq);
    await trigger();
    await page.waitForTimeout(1500);
    page.off("request", onReq);
    return count;
  }

  test("re-focusing a storefront tab refreshes it; the admin is left alone", async ({ page }) => {
    // Shop: a visibilitychange triggers a refresh.
    await page.goto("/en/shop/perfumes/", { waitUntil: "networkidle" });
    expect(await countRscOn(page, () => fireVisible(page))).toBeGreaterThanOrEqual(1);

    // A rapid second flicker within the cooldown does NOT refresh again.
    expect(await countRscOn(page, () => fireVisible(page))).toBe(0);

    // Checkout: also refreshes.
    await page.goto("/en/checkout/", { waitUntil: "networkidle" });
    expect(await countRscOn(page, () => fireVisible(page))).toBeGreaterThanOrEqual(1);

    // Admin: the refresher is NOT mounted there, so re-focus does nothing (never disrupts an edit).
    await signIn(page);
    await page.goto("/en/admin/products/", { waitUntil: "networkidle" });
    expect(await countRscOn(page, () => fireVisible(page))).toBe(0);
  });
});
