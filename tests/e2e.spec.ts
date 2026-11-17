import { expect, test, type Page } from "@playwright/test";

import { clearOrders, readLatestOrder, readOrderSecrets, readVariantStock } from "./db";

// Core shopping flows against the `next start` production server (run `npm run build` first). The
// purchase flow is REAL now: add to bag → checkout → the hosted /sandbox/pay page → Approve/Decline →
// /checkout/result, settled server-side (orders + stock in Postgres). DB assertions use tests/db.ts.

const BAG_KEY = "ms-bag";

async function addFromProductPage(page: Page, slug: string) {
  await page.goto(`/en/product/${slug}/`);
  await page.getByRole("button", { name: "Add to bag", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

async function fillCheckout(page: Page, phone = "٩٩١٢٣٤٥٦") {
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

/** Drive the hosted sandbox page to the chosen outcome, landing back on /checkout/result. */
async function paySandbox(page: Page, outcome: "approve" | "decline" | "cancel") {
  await page.getByTestId("checkout-pay").first().click();
  await page.waitForURL(/\/sandbox\/pay\//, { timeout: 15_000 });
  const label = { approve: "Approve payment", decline: "Decline payment", cancel: "Cancel payment" }[outcome];
  await page.getByRole("button", { name: label }).click();
  await page.waitForURL(/\/checkout\/result\//, { timeout: 15_000 });
}

/** Submit the guest order-lookup form and wait for its server-action POST to settle. */
async function lookupGuestOrder(page: Page, number: string, phone: string) {
  await page.getByLabel("Order number").fill(number);
  await page.getByLabel("Mobile number").fill(phone);
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/orders")),
    page.getByTestId("lookup-submit").click(),
  ]);
}

test.describe("shopping flows", () => {
  test.skip(({ isMobile }) => isMobile, "Long flows run on the desktop project");
  // Each test here places a REAL order in Postgres; clear them so the admin "N samples" counts stay
  // deterministic and stock deltas are read per test.
  test.afterEach(async () => {
    await clearOrders();
  });

  test("add to bag → checkout → sandbox Approve → paid + stock decremented, receipt survives refresh", async ({ page }) => {
    const before = await readVariantStock("MS-I-50");
    await addFromProductPage(page, "i");
    await expect(page.getByTestId("bag-line")).toHaveCount(1);
    await page.getByTestId("bag-checkout").click();
    await page.waitForURL(/\/checkout\/$/);

    await fillCheckout(page);
    await expect(page.getByLabel("Mobile number")).toHaveValue("99123456"); // Arabic digits normalised
    await paySandbox(page, "approve");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Thank you");
    await expect(page.getByText(/MS-\d{5}/).first()).toBeVisible();

    // The backend settled it: the order is paid and variants.stock dropped by exactly one.
    const order = await readLatestOrder();
    expect(order?.status).toBe("paid");
    expect(await readVariantStock("MS-I-50")).toBe(before - 1);

    // The bag was cleared exactly once; a refresh re-renders (re-settles) but never double-decrements.
    const bag = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "{}"), BAG_KEY);
    expect(bag.state.lines).toHaveLength(0);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Thank you");
    expect(await readVariantStock("MS-I-50")).toBe(before - 1);
  });

  test("declined payment keeps the bag, leaves stock untouched, and offers a retry", async ({ page }) => {
    const before = await readVariantStock("MS-AURA-100");
    await addFromProductPage(page, "aura");
    await page.goto("/en/checkout/");
    await fillCheckout(page);
    await paySandbox(page, "decline");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(/not completed/i);
    await expect(page.getByText(/not been charged/i)).toBeVisible();

    // Unpaid in the DB, stock unchanged, bag retained.
    expect((await readLatestOrder())?.status).toBe("failed");
    expect(await readVariantStock("MS-AURA-100")).toBe(before);
    const bag = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "{}"), BAG_KEY);
    expect(bag.state.lines).toHaveLength(1);
    await expect(page.getByRole("button", { name: /Try again/i }).or(page.getByRole("link", { name: /Try again/i }))).toBeVisible();
  });

  test("a paid order is looked up by id + checkout phone; a wrong phone and an unknown id both say not found", async ({ page }) => {
    await addFromProductPage(page, "i");
    await page.goto("/en/checkout/");
    await fillCheckout(page); // checkout phone normalises to 99123456
    await paySandbox(page, "approve");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Thank you");
    const order = await readLatestOrder();
    expect(order?.status).toBe("paid");
    const id = order!.id;

    await page.goto("/en/orders/");

    // Correct id + phone → the inline receipt showing the order.
    await lookupGuestOrder(page, id, "99123456");
    await expect(page.getByTestId("lookup-result")).toBeVisible();
    await expect(page.getByTestId("lookup-result")).toContainText(id);

    // A wrong (but valid) phone → the generic not-found; no receipt leaks.
    await lookupGuestOrder(page, id, "99999999");
    await expect(page.getByTestId("lookup-notfound")).toBeVisible();
    await expect(page.getByTestId("lookup-result")).toHaveCount(0);
    const wrongPhoneNotice = await page.getByTestId("lookup-notfound").innerText();

    // An unknown id + the real phone → the IDENTICAL not-found (no existence oracle).
    await lookupGuestOrder(page, "MS-99999", "99123456");
    await expect(page.getByTestId("lookup-notfound")).toBeVisible();
    expect(await page.getByTestId("lookup-notfound").innerText()).toBe(wrongPhoneNotice);
  });

  test("the looked-up receipt carries no name and no address, and leaks no token / payment id", async ({ page }) => {
    await addFromProductPage(page, "i");
    await page.goto("/en/checkout/");
    await fillCheckout(page, "99222222"); // name "Fatma Al-Kandari", street "Baghdad Street"
    await paySandbox(page, "approve");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Thank you");
    const id = (await readLatestOrder())!.id;
    const secrets = await readOrderSecrets(id);

    await page.goto("/en/orders/");
    await page.getByLabel("Order number").fill(id);
    await page.getByLabel("Mobile number").fill("99222222");
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/orders")),
      page.getByTestId("lookup-submit").click(),
    ]);

    // The action's serialized response carries ONLY the reduced projection.
    const body = await resp.text();
    expect(body).not.toContain("Fatma"); // customer name
    expect(body).not.toContain("Baghdad"); // street / address
    expect(body).not.toContain("sbx_"); // provider payment id prefix
    expect(body).not.toContain(secrets.checkoutToken);
    if (secrets.providerPaymentId) expect(body).not.toContain(secrets.providerPaymentId);

    // And nothing renders the PII either.
    await expect(page.getByTestId("lookup-result")).toBeVisible();
    const rendered = await page.getByTestId("lookup-result").innerText();
    expect(rendered).not.toContain("Fatma");
    expect(rendered).not.toContain("Baghdad");
  });

  test("a non-paid (declined) order cannot be looked up", async ({ page }) => {
    await addFromProductPage(page, "aura");
    await page.goto("/en/checkout/");
    await fillCheckout(page, "99333333");
    await paySandbox(page, "decline");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/not completed/i);
    const order = await readLatestOrder();
    expect(order?.status).toBe("failed");

    await page.goto("/en/orders/");
    await lookupGuestOrder(page, order!.id, "99333333");
    await expect(page.getByTestId("lookup-notfound")).toBeVisible();
    await expect(page.getByTestId("lookup-result")).toHaveCount(0);
  });

  test("too many lookups for one phone are throttled", async ({ page }) => {
    await page.goto("/en/orders/");
    // Randomize the phone + id band per run so a retry / re-run within 15 min against the same server's
    // in-memory counter starts fresh (the throttle has no clear-on-success), and so this test never
    // poisons the fixed phones the other lookup tests use.
    const phone = `9${String(Math.floor(1_000_000 + Math.random() * 8_999_999))}`; // valid KW mobile
    const idBase = 2_000_000 + Math.floor(Math.random() * 1_000_000);

    // Each attempt uses a UNIQUE IP (via XFF) and a UNIQUE unknown id, so only the per-phone counter
    // can ever trip. After the ~10 threshold the next lookup is throttled.
    for (let i = 0; i < 10; i++) {
      await page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${i + 1}` });
      await lookupGuestOrder(page, `MS-${idBase + i}`, phone);
      await expect(page.getByTestId("lookup-notfound")).toBeVisible();
    }
    await page.setExtraHTTPHeaders({ "x-forwarded-for": "203.0.113.200" });
    await lookupGuestOrder(page, `MS-${idBase + 10}`, phone);
    await expect(page.getByTestId("lookup-throttled")).toBeVisible();
    await expect(page.getByTestId("lookup-notfound")).toHaveCount(0);
  });

  test("landline numbers are rejected with a clear message", async ({ page }) => {
    await addFromProductPage(page, "cafe");
    await page.goto("/en/checkout/");
    await fillCheckout(page, "22212345");
    await page.getByTestId("checkout-pay").first().click();
    await expect(page.getByText(/mobile number/i).first()).toBeVisible();
    await expect(page).toHaveURL(/\/checkout\/$/);
  });

  test("switching language keeps the page and the bag", async ({ page }) => {
    await addFromProductPage(page, "ii");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /Language/ }).first().click();
    await page.waitForURL(/\/ar\/product\/ii\/$/);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByTestId("bag-button").filter({ visible: true }).first()).toHaveAccessibleName(/1|قطعة واحدة/);
  });

  test("delivery is always charged — there is no free delivery", async ({ page }) => {
    await addFromProductPage(page, "i");
    await addFromProductPage(page, "iii"); // KWD 38.000 of products
    const bag = page.getByRole("dialog");
    await expect(bag.getByTestId("bag-line")).toHaveCount(2);
    await expect(bag.getByText(/free/i)).toHaveCount(0);
    await expect(bag.getByText("KWD 40.000")).toBeVisible(); // + KWD 2.000 delivery
  });

  test("checkout shows one Delivery block with the fee and no choice of method", async ({ page }) => {
    await addFromProductPage(page, "i");
    await page.goto("/en/checkout/");

    const deliverySection = page.locator("section:has(#ck-delivery-title)");
    await expect(deliverySection).toBeVisible();
    // No standard/express choice — the delivery section carries no radios.
    await expect(deliverySection.getByRole("radio")).toHaveCount(0);
    await expect(deliverySection.getByText("KWD 2.000")).toBeVisible();
    // The old delivery-method wording is gone ("Express checkout", a payment feature, is unrelated).
    await expect(page.getByText(/2-hour express|Standard delivery/i)).toHaveCount(0);
  });

  test("a bag of discontinued products shows no totals and no checkout", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("ms-bag", JSON.stringify({ state: { lines: [{ sku: "MS-TRILOGY-SET", qty: 1 }], promo: null }, version: 2 }));
    });
    await page.goto("/en/cart/");
    await expect(page.getByText(/no longer available/i).first()).toBeVisible();
    await expect(page.getByText(/KWD 0\.000/)).toHaveCount(0);
    await expect(page.getByTestId("bag-checkout")).toHaveCount(0);
    await page.goto("/en/checkout/");
    await expect(page.getByText(/Your bag is empty/i).first()).toBeVisible();
  });

  test("deep link to checkout with an empty bag shows the empty state", async ({ page }) => {
    await page.goto("/en/checkout/");
    await expect(page.getByText(/Your bag is empty/i).first()).toBeVisible();
  });
});

test.describe("navigation and media", () => {
  test("the menu lists the four collections, each its own page", async ({ page }) => {
    await page.goto("/en/product/i/");
    await page.getByTestId("menu-button").click();
    const menu = page.getByRole("dialog", { name: "Menu" });
    await expect(menu.getByRole("navigation").getByRole("link")).toHaveText(["Perfumes", "Oud", "Body", "Home"]);
    await menu.getByRole("link", { name: "Oud" }).click();
    await page.waitForURL(/\/en\/shop\/oud\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Oud");
    await expect(page.getByText("2 products")).toBeVisible();
    await expect(page.getByRole("link", { name: /Natural Oud Chips/ }).first()).toBeVisible();

    // The logo leads back to the home page.
    await page.getByRole("link", { name: "Mystic Sand — home" }).click();
    await page.waitForURL(/\/en\/$/);
  });

  test("collection chips keep your place on the page", async ({ page }) => {
    await page.goto("/en/shop/perfumes/");
    const chips = page.getByRole("navigation", { name: "Categories" });
    const steps: Array<[string, string]> = [
      ["Oud", "/en/shop/oud/"],
      ["Body", "/en/shop/body/"],
      ["Home", "/en/shop/home/"],
      ["All", "/en/shop/"],
      ["Perfumes", "/en/shop/perfumes/"],
    ];
    for (const [name, path] of steps) {
      await page.evaluate(() => window.scrollTo(0, 300));
      await chips.getByRole("link", { name, exact: true }).click();
      await page.waitForURL(`**${path}`);
      await page.waitForTimeout(300);
      // Same place as before the click (a page too short to scroll that far stops at its end).
      const { y, max } = await page.evaluate(() => ({
        y: Math.round(window.scrollY),
        max: document.documentElement.scrollHeight - window.innerHeight,
      }));
      expect(y).toBe(Math.min(300, max));
    }
  });

  test("compact footer, plain Instagram photos and no sign-up", async ({ page }) => {
    await page.goto("/en/");
    const footer = page.locator("footer");
    // Only Instagram and WhatsApp are links; no sign-up form anywhere.
    await expect(footer.getByRole("link")).toHaveText(["@mystic.sand", "+965 9932 5773"]);
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByText("Stay in the moment")).toHaveCount(0);
    await expect(footer.getByText("© 2026 Mystic Sand. All rights reserved.")).toBeVisible();
    await expect(footer.getByText(/Mystic Sand General Trading · CR No\. 000000/)).toBeVisible();
    await expect(footer.getByText("Secure payment")).toBeVisible();
    // The Instagram photos are plain images; the @mystic.sand heading opens Instagram.
    await expect(page.locator("section:has(#instagram-title) ul a")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Follow us/i })).toHaveCount(0);
    // Photos first, then the @mystic.sand heading under them.
    await expect(page.locator("section:has(#instagram-title) > :first-child")).toHaveJSProperty("tagName", "UL");
    const handle = page.locator("#instagram-title a");
    await expect(handle).toHaveAttribute("href", "https://www.instagram.com/mystic.sand/");
    await expect(handle).toHaveAttribute("target", "_blank");
  });

  test("product cards always show the second photo, with no swap on hover", async ({ page }) => {
    await page.goto("/en/shop/home/");
    const images = page.locator("article").filter({ hasText: "Mist" }).locator("img");
    await expect(images).toHaveCount(1);
    await expect(images.first()).toHaveAttribute("src", /renders\/mist/);
  });

  test("the shop sort's default option reads “-”", async ({ page }) => {
    await page.goto("/en/shop/");
    const sort = page.getByLabel("Sort by");
    await expect(sort).toHaveValue("featured");
    await expect(sort.locator("option").first()).toHaveText("-");
  });

  test("the product page shows How to use and the tagline, with no notes or delivery boxes", async ({ page }) => {
    test.skip(true, "Phase 8 E2E rewrite: data is server-fed from the DB now (localStorage ms-catalog seeding no longer reaches the storefront).");
    // Seed a custom tagline through the live catalog (ms-catalog) and see it on the page.
    await page.addInitScript(() => {
      localStorage.setItem(
        "ms-catalog",
        JSON.stringify({
          state: {
            edits: {
              patches: { i: { tagline: { en: "A seeded tagline for testing.", ar: "سطر تعريفي تجريبي." } } },
              added: [],
              categories: {},
            },
          },
          version: 1,
        }),
      );
    });
    await page.goto("/en/product/i/");

    await expect(page.getByText("A seeded tagline for testing.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "How to use" })).toBeVisible();
    // No fragrance notes and no delivery boxes anywhere on the page.
    await expect(page.getByText("The notes")).toHaveCount(0);
    await expect(page.getByText("Delivery & returns")).toHaveCount(0);
    await expect(page.getByText(/Standard delivery arrives|Order within/i)).toHaveCount(0);
    // The WhatsApp help link stays.
    await expect(page.getByRole("link", { name: /Chat with us on WhatsApp/ })).toBeVisible();
  });

  test("product photos show one at a time, with arrows", async ({ page }) => {
    await page.goto("/en/product/i/");
    const counter = page.getByTestId("gallery-counter");
    await expect(counter).toHaveText("1 / 5");
    await page.getByTestId("gallery-next").click();
    await expect(counter).toHaveText("2 / 5");
    await page.getByTestId("gallery-previous").click();
    await page.getByTestId("gallery-previous").click();
    await expect(counter).toHaveText("5 / 5");
    await expect(page.getByText(/gift/i)).toHaveCount(0);
  });

  test("videos play on a loop with no controls", async ({ page }) => {
    await page.goto("/en/");
    const hero = page.locator("#hero-title").locator("xpath=ancestor::section").locator("video");
    await expect(hero).toHaveJSProperty("loop", true);
    await expect.poll(() => hero.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0)).toBe(true);

    const film = page.getByLabel("Mystic Sand brand film");
    await film.scrollIntoViewIfNeeded();
    await expect(film).toHaveJSProperty("loop", true);
    await expect.poll(() => film.evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true);

    await expect(page.getByRole("button", { name: /pause|play|mute/i })).toHaveCount(0);
  });
});

const PAGES = [
  "/en/",
  "/ar/",
  "/en/shop/",
  "/en/shop/perfumes/",
  "/ar/shop/oud/",
  "/en/shop/body/",
  "/ar/shop/home/",
  "/en/product/i/",
  "/ar/product/oud-chips/",
  "/en/cart/",
  "/en/orders/",
  "/ar/contact/",
  "/en/faq/",
  "/ar/terms/",
  "/en/privacy/",
  "/en/refund-policy/",
  "/ar/delivery/",
];

test.describe("pages load cleanly", () => {
  for (const path of PAGES) {
    test(`${path} renders without console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible();
      await page.waitForTimeout(400);
      expect(errors).toEqual([]);
    });
  }
});
