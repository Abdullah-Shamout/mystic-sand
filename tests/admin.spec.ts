import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";

// The admin area is a browser-only demo gate (see src/lib/admin-auth.ts). These tests cover
// the header entry, the sign-in flow, the signed-out gate and the admin-messages split.
// Run `npm run build` first — they hit the static export served at localhost:4319.

const ADMIN_USER = "admin";
const ADMIN_PASS = "MysticSand2026";

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

test.describe("admin sign-in", () => {
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
// Long flows on the desktop project. A far-future session is injected so the admin area opens
// without the sign-in step; the sample orders are seeded by the shell on first visit.

const FAR_FUTURE = 4102444800000; // ~ year 2100 (ms)

type StoredOrder = {
  id: string;
  status: string;
  method: string;
  details: { name: string; phone: string; deliveryMethod: string };
  totals: { totalFils: number };
};
type StoredAdmin = { fulfillment: Record<string, { doneAt: string }>; samples: StoredOrder[] };

async function signIn(page: Page) {
  await page.addInitScript((exp) => {
    try {
      sessionStorage.setItem("ms-admin-session", JSON.stringify({ u: "admin", exp }));
    } catch {
      // storage blocked
    }
  }, FAR_FUTURE);
}

async function readAdmin(page: Page): Promise<StoredAdmin> {
  return page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("ms-admin") || "{}");
    const s = raw.state ?? {};
    return { fulfillment: s.fulfillment ?? {}, samples: s.samples ?? [] };
  });
}

const doneSamples = (a: StoredAdmin) => a.samples.filter((o) => o.status === "paid" && a.fulfillment[o.id]);

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

  test("lists 30 sample orders with matching KPI counts and revenue", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/");
    await expect.poll(() => resultCount(page)).toBe(30);
    await expect(page.getByTestId("order-row").first().getByText("Sample")).toBeVisible();

    const admin = await readAdmin(page);
    expect(admin.samples).toHaveLength(30);

    const completed = doneSamples(admin).length;
    const expectedRevenue = doneSamples(admin).reduce((sum, o) => sum + o.totals.totalFils, 0);

    const kpiCompleted = await readInt(page, "kpi-completed-value");
    const kpiPending = await readInt(page, "kpi-pending-value");
    expect(kpiCompleted + kpiPending).toBe(30);
    expect(kpiCompleted).toBe(completed);
    expect(await readKwd(page, "kpi-revenue-value")).toBe(expectedRevenue);
  });

  test("search narrows by Latin name, Arabic name and order number (Arabic digits too)", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/");
    await expect.poll(() => resultCount(page)).toBe(30);
    const admin = await readAdmin(page);
    const search = page.getByTestId("orders-search");

    const latin = admin.samples.find((o) => /^[A-Za-z]/.test(o.details.name))!;
    await search.fill(latin.details.name);
    await expect(page.getByText(latin.id).first()).toBeVisible();
    await expect.poll(() => resultCount(page)).toBeLessThan(30);

    const arabic = admin.samples.find((o) => /[؀-ۿ]/.test(o.details.name))!;
    await search.fill(arabic.details.name);
    await expect(page.getByText(arabic.id).first()).toBeVisible();

    const target = admin.samples[0];
    await search.fill(toArabicIndic(target.id.replace("MS-", "")));
    await expect.poll(() => resultCount(page)).toBe(1);
    await expect(page.getByText(target.id).first()).toBeVisible();
  });

  test("each filter narrows to a consistent set of rows", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/");
    await expect.poll(() => resultCount(page)).toBe(30);
    const admin = await readAdmin(page);
    const completed = doneSamples(admin).length;
    const pending = 30 - completed;
    const knet = admin.samples.filter((o) => o.method === "knet").length;
    const express = admin.samples.filter((o) => o.details.deliveryMethod === "express").length;

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
    expect(c30).toBeLessThanOrEqual(30);
    await page.getByLabel("Period").selectOption("all");

    await page.getByLabel("Payment").selectOption("knet");
    await expect.poll(() => resultCount(page)).toBe(knet);
    await page.getByLabel("Payment").selectOption("all");

    await page.getByLabel("Delivery").selectOption("express");
    await expect.poll(() => resultCount(page)).toBe(express);
    await page.getByLabel("Delivery").selectOption("all");

    await page.getByRole("button", { name: "Website", exact: true }).click();
    await expect.poll(() => resultCount(page)).toBe(0);
    await expect(page.getByText("No orders match these filters.")).toBeVisible();
  });

  test("marking a paid order done updates KPIs, survives reload and undoes", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/");
    await expect.poll(() => resultCount(page)).toBe(30);

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
    await page.goto("/en/admin/");
    await expect.poll(() => resultCount(page)).toBe(30);
    const admin = await readAdmin(page);
    const sample = admin.samples[0];

    await page.goto(`/en/admin/?order=${sample.id}`);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(sample.id).first()).toBeVisible();
    await expect(dialog.getByText(sample.details.name).first()).toBeVisible();
  });

  test("Excel export downloads a filtered .xlsx that unzips to an order id", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/");
    await expect.poll(() => resultCount(page)).toBe(30);
    const admin = await readAdmin(page);

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
    expect(xml).toContain(admin.samples[0].id);
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

  test("the receipt downloads as a real PDF over 20 KB", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/");
    await expect.poll(() => resultCount(page)).toBe(30);
    const admin = await readAdmin(page);

    await page.goto(`/en/admin/?order=${admin.samples[0].id}`);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      dialog.getByTestId("receipt-pdf").click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^Mystic-Sand-Invoice-MS-\d+\.pdf$/);
    const buf = fs.readFileSync((await download.path())!);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // The invoice is embedded as a JPEG; a blank page would compress to a few KB.
    const body = buf.toString("latin1");
    expect(body).toContain("/DCTDecode");
    expect(buf.length).toBeGreaterThan(120_000);
    expect(buf.length).toBeLessThan(3_000_000);
  });

  test("a real order placed in the store appears as a Website order", async ({ page }) => {
    await signIn(page);
    await page.addInitScript(() => {
      const iso = new Date().toISOString();
      const order = {
        id: "MS-50001",
        createdAt: iso,
        locale: "en",
        lines: [
          { sku: "MS-I-50", slug: "i", qty: 1, priceFils: 19000, name: "I", size: { en: "50 ml", ar: "50 مل" }, image: "products/i/bottle" },
        ],
        totals: { itemCount: 1, subtotalFils: 19000, discountFils: 0, deliveryFils: 1000, totalFils: 20000 },
        details: {
          name: "Website Tester", phone: "99887766", email: "", areaId: "salmiya", housing: "house",
          block: "1", street: "Street 1", avenue: "", building: "5", floor: "", apartment: "",
          mapsLink: "", notes: "", deliveryMethod: "standard", paymentMethod: "knet", saveDetails: true,
        },
        promoCode: null,
        bagKey: "MS-I-50x1|standard|",
        method: "knet",
        status: "paid",
        attempts: [
          { method: "knet", result: "CAPTURED", paymentId: "100123456789012345", trackId: "MS-50001", tranId: "123456789012345", ref: "123456789012", auth: "123456", postDate: "1009", amountFils: 20000, at: iso },
        ],
        finalizedAt: iso,
      };
      localStorage.setItem(
        "ms-checkout",
        JSON.stringify({ state: { draft: {}, remembered: null, orders: { "MS-50001": order }, lastOrderId: "MS-50001" }, version: 2 }),
      );
    });

    await page.goto("/en/admin/");
    await expect.poll(() => resultCount(page)).toBe(31);

    await page.getByRole("button", { name: "Website", exact: true }).click();
    await expect.poll(() => resultCount(page)).toBe(1);
    await expect(page.getByTestId("order-row").filter({ hasText: "MS-50001" })).toHaveCount(1);
    await expect(page.getByTestId("order-row").first().getByText("Sample")).toHaveCount(0);
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
