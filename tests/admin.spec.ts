import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";

// The admin area is a browser-only demo gate (see src/lib/admin-auth.ts). These tests cover
// the header entry, the sign-in flow, the signed-out gate and the admin-messages split.
// Run `npm run build` first — they hit the static export served at localhost:4319.

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

  test("lists 31 sample orders with matching KPI counts and revenue", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/");
    await expect.poll(() => resultCount(page)).toBe(31);
    await expect(page.getByTestId("order-row").first().getByText("Sample")).toBeVisible();

    const admin = await readAdmin(page);
    expect(admin.samples).toHaveLength(31);

    const completed = doneSamples(admin).length;
    const expectedRevenue = doneSamples(admin).reduce((sum, o) => sum + o.totals.totalFils, 0);

    const kpiCompleted = await readInt(page, "kpi-completed-value");
    const kpiPending = await readInt(page, "kpi-pending-value");
    expect(kpiCompleted + kpiPending).toBe(31);
    expect(kpiCompleted).toBe(completed);
    expect(await readKwd(page, "kpi-revenue-value")).toBe(expectedRevenue);
  });

  test("search narrows by Latin name, Arabic name and order number (Arabic digits too)", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/");
    await expect.poll(() => resultCount(page)).toBe(31);
    const admin = await readAdmin(page);
    const search = page.getByTestId("orders-search");

    const latin = admin.samples.find((o) => /^[A-Za-z]/.test(o.details.name))!;
    await search.fill(latin.details.name);
    await expect(page.getByText(latin.id).first()).toBeVisible();
    await expect.poll(() => resultCount(page)).toBeLessThan(31);

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
    await expect.poll(() => resultCount(page)).toBe(31);
    const admin = await readAdmin(page);
    const completed = doneSamples(admin).length;
    const pending = 31 - completed;
    const knet = admin.samples.filter((o) => o.method === "knet").length;

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
    expect(c30).toBeLessThanOrEqual(31);
    await page.getByLabel("Period").selectOption("all");

    await page.getByLabel("Payment").selectOption("knet");
    await expect.poll(() => resultCount(page)).toBe(knet);
    await page.getByLabel("Payment").selectOption("all");

    await page.getByRole("button", { name: "Website", exact: true }).click();
    await expect.poll(() => resultCount(page)).toBe(0);
    await expect(page.getByText("No orders match these filters.")).toBeVisible();
  });

  test("there is no Unpaid filter, no Delivery filter and no Confirming status", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/");
    await expect.poll(() => resultCount(page)).toBe(31);

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

  test("marking a paid order done updates KPIs, survives reload and undoes", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/");
    await expect.poll(() => resultCount(page)).toBe(31);

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
    await expect.poll(() => resultCount(page)).toBe(31);
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
    await expect.poll(() => resultCount(page)).toBe(31);
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
    await expect.poll(() => resultCount(page)).toBe(31);
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
    // 31 built-in samples + the 1 real website order.
    await expect.poll(() => resultCount(page)).toBe(32);

    await page.getByRole("button", { name: "Website", exact: true }).click();
    await expect.poll(() => resultCount(page)).toBe(1);
    await expect(page.getByTestId("order-row").filter({ hasText: "MS-50001" })).toHaveCount(1);
    await expect(page.getByTestId("order-row").first().getByText("Sample")).toHaveCount(0);
  });

  test("the built-in 67095252 order is searchable and its receipt downloads", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/");
    await expect.poll(() => resultCount(page)).toBe(31);

    // Searchable by the full phone and by a partial.
    const search = page.getByTestId("orders-search");
    await search.fill("67095252");
    await expect.poll(() => resultCount(page)).toBe(1);
    await expect(page.getByText("MS-19999").first()).toBeVisible();
    await expect(page.getByText("Abdulaziz Al-Mutairi").first()).toBeVisible();

    await search.fill("6709");
    await expect(page.getByText("MS-19999").first()).toBeVisible();

    // Its receipt is a real PDF (the full fake payment record makes the invoice render).
    await page.goto("/en/admin/?order=MS-19999");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      dialog.getByTestId("receipt-pdf").click(),
    ]);
    expect(download.suggestedFilename()).toBe("Mystic-Sand-Invoice-MS-19999.pdf");
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
    await expect(page.getByRole("dialog").getByText("KWD 10.500")).toBeVisible(); // 9.500 + 1.000 delivery
  });

  test("uploads a photo that appears in the gallery and the preview", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/products/edit/?p=new");

    await page.getByTestId("editor-upload-input").setInputFiles({
      name: "shot.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });

    await expect(page.getByTestId("editor-photos").locator("li")).toHaveCount(1);
    await expect(page.getByTestId("editor-preview").locator("img")).toHaveCount(1);
    await expect
      .poll(() => page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith("ms-img:"))))
      .toBe(true);

    // The stored upload record is a sane compressed image.
    const upload = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith("ms-img:"))!;
      return JSON.parse(localStorage.getItem(key)!) as { w: number; h: number; kind: string; data: string };
    });
    expect(upload.w).toBeGreaterThan(0);
    expect(upload.h).toBeGreaterThan(0);
    expect(["packshot", "photo"]).toContain(upload.kind);
    expect(upload.data.startsWith("data:image/")).toBe(true);
  });

  test("an uploaded photo joins the reusable library and shows for another product after reload", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/products/edit/?p=new");

    await page.getByTestId("editor-upload-input").setInputFiles({
      name: "shot.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });
    await expect(page.getByTestId("editor-photos").locator("li")).toHaveCount(1);

    // Reload into a fresh product; the upload persists and shows under "Your uploads" in the library.
    await page.reload();
    await page.getByTestId("editor-add-library").click();
    await expect(page.getByTestId("library-uploads").getByTestId("library-upload-item")).toHaveCount(1);
  });

  test("the editor's related search finds a custom product", async ({ page }) => {
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
    await page.goto("/en/admin/products/edit/?p=i");
    const price = page.getByTestId("editor-variant-price-0");
    await expect(price).toHaveValue("19.000");
    await price.fill("21.000");
    await page.getByTestId("editor-save").click();
    await page.waitForURL(/\/admin\/products\/$/);

    // The stored patch is minimal: the price changed, the gallery was left untouched.
    const patch = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem("ms-catalog") || "{}");
      return raw.state?.edits?.patches?.i ?? {};
    });
    expect(Object.keys(patch)).toContain("variants");
    expect(Object.keys(patch)).not.toContain("images");

    await page.goto("/en/product/i/");
    await expect(page.getByText("KWD 21.000").first()).toBeVisible();
    await expect(page.getByTestId("gallery-counter")).toHaveText("1 / 5");

    // Reset from the list restores the original price.
    await page.goto("/en/admin/products/");
    const row = page.locator('[data-testid="product-row"][data-slug="i"]');
    await row.getByRole("button", { name: "Reset I", exact: true }).click();
    await page.getByTestId("confirm-accept").click();

    await page.goto("/en/product/i/");
    await expect(page.getByText("KWD 19.000").first()).toBeVisible();
  });

  test("moving a product to another collection from the list updates both", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/products/");
    await page.getByLabel("Collection for AURA", { exact: true }).selectOption("home");

    await page.goto("/en/shop/body/");
    await expect(page.getByText("Nothing here yet — explore the other collections.")).toBeVisible();

    await page.goto("/en/shop/home/");
    await expect(page.getByText("4 products")).toBeVisible();
  });

  test("hiding a product removes it from the store and shows a Hidden badge", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/products/");
    const row = page.locator('[data-testid="product-row"][data-slug="mist"]');
    await row.getByRole("button", { name: "Hide Mist", exact: true }).click();
    await expect(row.getByText("Hidden", { exact: true })).toBeVisible();

    await page.goto("/en/shop/home/");
    await expect(page.getByText("2 products")).toBeVisible();
    await expect(page.locator("article").filter({ hasText: "Mist" })).toHaveCount(0);

    // Show restores it.
    await page.goto("/en/admin/products/");
    const again = page.locator('[data-testid="product-row"][data-slug="mist"]');
    await again.getByRole("button", { name: "Show Mist", exact: true }).click();
    await page.goto("/en/shop/home/");
    await expect(page.getByText("3 products")).toBeVisible();
  });

  test("deleting a custom product removes it from the list and the store", async ({ page }) => {
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
    await page.goto("/en/admin/products/");
    await page.getByTestId("collection-home-name-en").fill("Home & Living");
    await page.getByTestId("collection-home-save").click();

    await page.goto("/en/shop/home/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Home & Living");

    await page.goto("/en/admin/products/");
    await page.getByTestId("collection-home-reset").click();

    await page.goto("/en/shop/home/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Home");
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
// Long flows on the desktop project. The far-future session opens the admin without signing in;
// the sample orders are seeded by the shell on first visit.

type FullLine = { slug: string; sku: string; qty: number; priceFils: number };
type FullSample = { id: string; status: string; lines: FullLine[] };

async function readSamplesFull(page: Page): Promise<FullSample[]> {
  return page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("ms-admin") || "{}");
    return (raw.state?.samples ?? []) as FullSample[];
  });
}

const paidSamples = (samples: FullSample[]) =>
  samples.filter((o) => o.status === "paid" || o.status === "confirming");

const section = (page: Page, slug: string) =>
  page.locator(`[data-testid="analysis-section"][data-slug="${slug}"]`);
const sectionRows = (page: Page, slug: string) =>
  section(page, slug).locator('[data-testid="analysis-row"]');

test.describe("admin product analysis", () => {
  test.skip(({ isMobile }) => isMobile, "Long flows run on the desktop project");

  test("groups products by collection, with OUD in two collections and matching unit counts", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/analysis/");
    await expect.poll(() => sectionRows(page, "perfumes").count()).toBe(5);
    await expect(sectionRows(page, "oud")).toHaveCount(2);
    await expect(sectionRows(page, "body")).toHaveCount(1);
    await expect(sectionRows(page, "home")).toHaveCount(3);

    const samples = paidSamples(await readSamplesFull(page));
    expect(samples.length).toBe(31);
    const unitsBySlug: Record<string, number> = {};
    for (const o of samples) for (const l of o.lines) unitsBySlug[l.slug] = (unitsBySlug[l.slug] ?? 0) + l.qty;

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

    // Every product row shows exactly the sum of its sample line quantities.
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
    await signIn(page);
    await page.goto("/en/admin/analysis/");
    await expect.poll(() => sectionRows(page, "perfumes").count()).toBe(5);

    const samples = paidSamples(await readSamplesFull(page));
    const admin = await readAdmin(page);
    const doneIds = new Set(Object.keys(admin.fulfillment));
    let expectedDoneUnits = 0;
    for (const o of samples) {
      if (o.status !== "paid" || !doneIds.has(o.id)) continue;
      for (const l of o.lines) expectedDoneUnits += l.qty;
    }

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
    await signIn(page);
    await page.addInitScript(() => {
      const product = {
        slug: "c-amber-analysis",
        name: "Amber Analysis",
        category: "body",
        type: { en: "All Over Spray", ar: "بخاخ معطّر للجسم" },
        tagline: { en: "A warm amber veil.", ar: "وشاح عنبري دافئ." },
        description: { en: "A warm amber veil for skin.", ar: "وشاح عنبري دافئ للبشرة." },
        howTo: { en: "Spray.", ar: "رشّ." },
        variants: [{ sku: "MS-AMBAN", size: { en: "100 ml", ar: "100 مل" }, priceFils: 9500, stock: 5 }],
        images: { card: "renders/aura", gallery: ["renders/aura"] },
        related: [],
        aliases: [],
        todo: [],
      };
      localStorage.setItem(
        "ms-catalog",
        JSON.stringify({ state: { edits: { patches: {}, added: [product], categories: {} } }, version: 1 }),
      );
      const iso = new Date().toISOString();
      const order = {
        id: "MS-50002",
        createdAt: iso,
        locale: "en",
        lines: [
          { sku: "MS-AMBAN", slug: "c-amber-analysis", qty: 3, priceFils: 9500, name: "Amber Analysis", size: { en: "100 ml", ar: "100 مل" }, image: "renders/aura" },
          { sku: "MS-GHOST", slug: "ghost-product", qty: 2, priceFils: 5000, name: "Ghosted Scent", size: { en: "50 ml", ar: "50 مل" }, image: "renders/aura" },
        ],
        totals: { itemCount: 5, subtotalFils: 38500, discountFils: 0, deliveryFils: 1000, totalFils: 39500 },
        details: {
          name: "Analysis Tester", phone: "99001122", email: "", areaId: "salmiya", housing: "house",
          block: "1", street: "Street 1", avenue: "", building: "5", floor: "", apartment: "",
          mapsLink: "", notes: "", deliveryMethod: "standard", paymentMethod: "knet", saveDetails: true,
        },
        promoCode: null,
        bagKey: "MS-AMBANx3|standard|",
        method: "knet",
        status: "paid",
        attempts: [
          { method: "knet", result: "CAPTURED", paymentId: "100123456789012345", trackId: "MS-50002", tranId: "123456789012345", ref: "123456789012", auth: "123456", postDate: "1009", amountFils: 39500, at: iso },
        ],
        finalizedAt: iso,
      };
      localStorage.setItem(
        "ms-checkout",
        JSON.stringify({ state: { draft: {}, remembered: null, orders: { "MS-50002": order }, lastOrderId: "MS-50002" }, version: 2 }),
      );
    });

    await page.goto("/en/admin/analysis/");
    const bodyRow = section(page, "body").locator('[data-testid="analysis-row"][data-slug="c-amber-analysis"]');
    await expect(bodyRow).toHaveCount(1);
    expect(await bodyRow.getAttribute("data-units")).toBe("3");
    await expect(bodyRow.getByText("Custom", { exact: true })).toBeVisible();

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
// Long flows on the desktop project. Settings are stored per field in ms-settings; the storefront
// (bag, FAQ, footer, contact, banner) reads them live after mount.

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

const readOverrides = async (page: Page) =>
  page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("ms-settings") || "{}");
    return (raw.state?.overrides ?? {}) as Record<string, unknown>;
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

  test("a delivery fee of 1.500 flows to the bag and FAQ, then resets to 1.000", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/settings/");
    const standard = page.getByTestId("settings-standard-fee");
    await expect(standard).toHaveValue("1.000");
    await standard.fill("1.500");
    await page.getByTestId("settings-fee-save").click();
    await expect(page.getByText("Saved.").first()).toBeVisible();

    // The bag's delivery line uses the live fee.
    await page.goto("/en/product/i/");
    await page.getByRole("button", { name: "Add to bag", exact: true }).first().click();
    const bag = page.getByRole("dialog");
    await expect(bag.getByText("KWD 1.500")).toBeVisible();

    // The FAQ copy reads the same live fee (the answer sits in a collapsed accordion).
    await page.goto("/en/faq/");
    await page.getByRole("button", { name: "How much does delivery cost?" }).click();
    await expect(page.getByText("KWD 1.500").first()).toBeVisible();

    // Reset to default restores KWD 1.000 everywhere.
    await page.goto("/en/admin/settings/");
    await page.getByTestId("settings-standard-reset").click();
    await expect(page.getByTestId("settings-standard-fee")).toHaveValue("1.000");
    await page.goto("/en/faq/");
    await page.getByRole("button", { name: "How much does delivery cost?" }).click();
    await expect(page.getByText("KWD 1.000").first()).toBeVisible();
  });

  test("a new WhatsApp number flows to the footer link", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/settings/");
    await page.getByTestId("settings-whatsapp").fill("91234567");
    await page.getByTestId("settings-contact-save").click();
    await expect(page.getByText("Saved.").first()).toBeVisible();

    await page.goto("/en/");
    const link = page.locator('footer a[href*="wa.me"]');
    await expect(link).toHaveAttribute("href", /wa\.me\/96591234567/);
    await expect(page.locator("footer").getByText("+965 9123 4567")).toBeVisible();
  });

  test("an invalid WhatsApp number shows an error and saves nothing", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/settings/");
    await page.getByTestId("settings-whatsapp").fill("22223333"); // a landline, not a mobile
    await page.getByTestId("settings-contact-save").click();
    await expect(page.getByText("Enter a valid Kuwaiti mobile number.")).toBeVisible();
    expect((await readOverrides(page)).whatsapp).toBeUndefined();
  });

  test("a new phone number flows to the footer and the contact page", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/settings/");
    await page.getByTestId("settings-phone").fill("22223333");
    await page.getByTestId("settings-contact-save").click();
    await expect(page.getByText("Saved.").first()).toBeVisible();

    await page.goto("/en/");
    await expect(page.locator("footer").getByText("+965 2222 3333")).toBeVisible();
    await page.goto("/en/contact/");
    await expect(page.getByText("+965 2222 3333").first()).toBeVisible();
  });

  test("custom ticker messages show per language, and the built-in option restores defaults", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/settings/");
    await page.getByTestId("ticker-en-add").click();
    await page.getByTestId("ticker-en-input-0").fill("Hello test");
    await page.getByTestId("ticker-ar-add").click();
    await page.getByTestId("ticker-ar-input-0").fill("مرحبا");
    await page.getByTestId("ticker-save").click();
    await expect(page.getByText("Saved.").first()).toBeVisible();

    await page.goto("/en/");
    const enTicker = page.getByRole("region", { name: "Announcements" });
    await expect(enTicker).toContainText("Hello test");
    await expect(enTicker).not.toContainText("Pay securely with KNET");

    await page.goto("/ar/");
    await expect(page.getByRole("region", { name: "الإعلانات" })).toContainText("مرحبا");

    // "Use the built-in messages" clears both lists.
    await page.goto("/en/admin/settings/");
    await page.getByTestId("ticker-built-in").click();
    await page.goto("/en/");
    await expect(page.getByRole("region", { name: "Announcements" })).toContainText(
      "Pay securely with KNET, Apple Pay or card",
    );
  });

  test("the default login works with MysticSand@2026 and the old password fails", async ({ page }) => {
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
