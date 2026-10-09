import { expect, test, type Page } from "@playwright/test";

// Core shopping flows against the static export (run `npm run build` first).

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

async function payWithKnet(page: Page) {
  await page.getByTestId("checkout-pay").first().click();
  await page.waitForURL(/\/checkout\/pay\//);
  await page.getByRole("radio", { name: /National Bank of Kuwait/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Submit" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  // Orders of KD 25 or more add the bank's SMS-code step.
  const smsConfirm = page.getByRole("button", { name: "Confirm", exact: true });
  if (await page.getByText(/verification code/i).isVisible().catch(() => false)) await smsConfirm.click();
  await page.waitForURL(/\/checkout\/result\//, { timeout: 15_000 });
}

test.describe("shopping flows", () => {
  test.skip(({ isMobile }) => isMobile, "Long flows run on the desktop project");

  test("add to bag → checkout → KNET captured → receipt survives refresh", async ({ page }) => {
    await addFromProductPage(page, "i");
    await expect(page.getByTestId("bag-line")).toHaveCount(1);
    await page.getByTestId("bag-checkout").click();
    await page.waitForURL(/\/checkout\/$/);

    await fillCheckout(page);
    await expect(page.getByLabel("Mobile number")).toHaveValue("99123456"); // Arabic digits normalised
    await payWithKnet(page);

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Thank you");
    await expect(page.getByText("CAPTURED").first()).toBeVisible();
    await expect(page.getByText(/MS-\d{5}/).first()).toBeVisible();

    // The bag was cleared exactly once; a refresh shows the same receipt.
    const bag = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "{}"), BAG_KEY);
    expect(bag.state.lines).toHaveLength(0);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Thank you");
  });

  test("declined payment keeps the bag and offers a retry", async ({ page }) => {
    await addFromProductPage(page, "aura");
    await page.goto("/en/checkout/");
    await page.evaluate(() => sessionStorage.setItem("ms-demo-outcome", "NOT CAPTURED"));
    await fillCheckout(page);
    await payWithKnet(page);

    await expect(page.getByRole("heading", { level: 1 })).toContainText(/not completed/i);
    await expect(page.getByText(/not been charged/i)).toBeVisible();
    const bag = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "{}"), BAG_KEY);
    expect(bag.state.lines).toHaveLength(1);
    await expect(page.getByRole("button", { name: /Try again/i }).or(page.getByRole("link", { name: /Try again/i }))).toBeVisible();
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
    await expect(bag.getByText("KWD 39.000")).toBeVisible(); // + KWD 1.000 delivery
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
    await expect(footer.getByRole("link")).toHaveText(["@mystic.sand", "+965 9000 0000"]);
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByText("Stay in the moment")).toHaveCount(0);
    await expect(footer.getByText("© 2026 Mystic Sand. All rights reserved.")).toBeVisible();
    await expect(footer.getByText(/Mystic Sand General Trading · CR No\. 000000/)).toBeVisible();
    await expect(footer.getByText("Secure payment")).toBeVisible();
    // The Instagram photos are plain images; the @mystic.sand heading opens Instagram.
    await expect(page.locator("section:has(#instagram-title) ul a")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Follow us/i })).toHaveCount(0);
    const handle = page.locator("#instagram-title a");
    await expect(handle).toHaveAttribute("href", "https://www.instagram.com/mystic.sand/");
    await expect(handle).toHaveAttribute("target", "_blank");
  });

  test("an open page picks up a newly published version, once", async ({ page }) => {
    let loads = 0;
    page.on("load", () => loads++);
    await page.route("**/version.json*", (route) => route.fulfill({ json: { id: "a-newer-build" } }));
    await page.goto("/en/");
    await expect.poll(() => loads).toBe(2); // the visit + one automatic reload
    await page.waitForTimeout(1500);
    expect(loads).toBe(2); // and never a loop
  });

  test("product cards always show the second photo, with no swap on hover", async ({ page }) => {
    await page.goto("/en/shop/home/");
    const images = page.locator("article").filter({ hasText: "Mist" }).locator("img");
    await expect(images).toHaveCount(1);
    await expect(images.first()).toHaveAttribute("src", /renders\/mist/);
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
