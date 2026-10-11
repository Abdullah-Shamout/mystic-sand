import { expect, test, type Page } from "@playwright/test";

// The storefront reads the admin's edits (ms-catalog) and settings (ms-settings) from this
// browser. These tests seed those stores in the zustand persist format before the page loads,
// then check every surface reflects the edit. Long flows run on the desktop project.

type Edits = {
  patches?: Record<string, unknown>;
  added?: unknown[];
  categories?: Record<string, unknown>;
};

/** Seed the catalog, settings and/or home stores exactly as zustand persist writes them. */
async function seed(
  page: Page,
  data: { catalog?: Edits; settings?: Record<string, unknown>; home?: Record<string, unknown> },
) {
  await page.addInitScript((d) => {
    if (d.catalog) {
      const edits = { patches: {}, added: [], categories: {}, ...d.catalog };
      localStorage.setItem("ms-catalog", JSON.stringify({ state: { edits }, version: 1 }));
    }
    if (d.settings) {
      localStorage.setItem("ms-settings", JSON.stringify({ state: { overrides: d.settings }, version: 1 }));
    }
    if (d.home) {
      localStorage.setItem("ms-home", JSON.stringify({ state: { overrides: d.home }, version: 1 }));
    }
  }, data);
}

// A complete, valid admin-added product (passes the catalog's normalizeAdded checks).
const CUSTOM_PRODUCT = {
  slug: "c-amber-nights-test",
  name: "Amber Nights",
  category: "body",
  type: { en: "Body mist", ar: "رذاذ للجسم" },
  tagline: { en: "A warm amber veil.", ar: "رذاذ عنبري دافئ." },
  description: { en: "A warm amber veil for skin, hair and clothes.", ar: "رذاذ عنبري دافئ للبشرة والشعر والملابس." },
  howTo: { en: "Spritz over skin and hair.", ar: "رشّ على البشرة والشعر." },
  variants: [{ sku: "MS-TEST01", size: { en: "100 ml", ar: "100 مل" }, priceFils: 9500, stock: 5 }],
  images: { card: "renders/aura", gallery: ["renders/aura"] },
  related: [],
  aliases: [],
  todo: [],
};

async function addToBagFromPdp(page: Page) {
  await page.getByRole("button", { name: "Add to bag", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

test.describe("live catalog & settings", () => {
  test.skip(({ isMobile }) => isMobile, "Long flows run on the desktop project");

  test("price edit flows to the card, the product page and the bag total", async ({ page }) => {
    await seed(page, {
      catalog: {
        patches: {
          i: { variants: [{ sku: "MS-I-50", size: { en: "50 ml", ar: "50 مل" }, priceFils: 21000, stock: 24 }] },
        },
      },
    });

    await page.goto("/en/shop/perfumes/");
    await expect(page.getByText("KWD 21.000")).toBeVisible();

    await page.goto("/en/product/i/");
    await expect(page.getByText("KWD 21.000").first()).toBeVisible();

    await addToBagFromPdp(page);
    await expect(page.getByRole("dialog").getByText("KWD 22.000")).toBeVisible(); // + KWD 1.000 delivery
  });

  test("hiding a product removes it from grids, search and its own page", async ({ page }) => {
    await seed(page, { catalog: { patches: { mist: { hidden: true } } } });

    await page.goto("/en/shop/home/");
    await expect(page.getByText("2 products")).toBeVisible();
    await expect(page.locator("article").filter({ hasText: "Mist" })).toHaveCount(0);

    // Searching surfaces other products (AURA lists "mist" as a term) but never the hidden Mist.
    await page.getByRole("button", { name: "Search", exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await page.getByRole("searchbox").fill("mist");
    await expect(dialog.getByRole("status")).toBeVisible();
    await expect(dialog.locator('a[href$="/product/mist/"]')).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.goto("/en/product/mist/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("No longer available");
  });

  test("moving a product between collections updates both and the breadcrumb", async ({ page }) => {
    await seed(page, { catalog: { patches: { aura: { category: "home" } } } });

    await page.goto("/en/shop/body/");
    await expect(page.getByText("Nothing here yet — explore the other collections.")).toBeVisible();

    await page.goto("/en/shop/home/");
    await expect(page.getByText("4 products")).toBeVisible();

    await page.goto("/en/product/aura/");
    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(breadcrumb.getByRole("link", { name: "Home" })).toBeVisible();
  });

  test("an admin-added product appears in its collection, its page and the bag", async ({ page }) => {
    await seed(page, { catalog: { added: [CUSTOM_PRODUCT] } });

    await page.goto("/en/shop/body/");
    await expect(page.getByText("2 products")).toBeVisible();
    await expect(page.getByText("Amber Nights")).toBeVisible();

    await page.goto("/en/product/?p=c-amber-nights-test");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Amber Nights");
    await expect(page.getByText("KWD 9.500").first()).toBeVisible();

    await addToBagFromPdp(page);
    await expect(page.getByRole("dialog").getByText("KWD 10.500")).toBeVisible(); // 9.500 + 1.000 delivery
  });

  test("store settings show across the bag, FAQ, footer and ticker", async ({ page }) => {
    await seed(page, {
      settings: {
        standardFeeFils: 1500,
        whatsapp: "96591234567",
        phone: "22223333",
        ticker: { en: ["Hello test"], ar: ["مرحبا"] },
      },
    });

    // Delivery fee in the bag.
    await page.goto("/en/product/i/");
    await addToBagFromPdp(page);
    await expect(page.getByRole("dialog").getByText("KWD 1.500")).toBeVisible();

    // Delivery fee in the FAQ (open the delivery-cost question).
    await page.goto("/en/faq/");
    await page.getByRole("button", { name: "How much does delivery cost?" }).click();
    await expect(page.getByText("KWD 1.500")).toBeVisible();

    // Footer WhatsApp link + legal-line phone.
    const footer = page.locator("footer");
    await expect(footer.getByText("+965 9123 4567")).toBeVisible();
    const whatsapp = footer.getByRole("link").filter({ hasText: "9123 4567" });
    await expect(whatsapp).toHaveAttribute("href", /96591234567/);
    await expect(footer.getByText("+965 2222 3333")).toBeVisible();

    // Custom ticker per language.
    await page.goto("/en/");
    await expect(page.getByText("Hello test")).toBeVisible();
    await page.goto("/ar/");
    await expect(page.getByText("مرحبا")).toBeVisible();
  });
});

// Every page in the e2e PAGES list, with all edits + settings + deliberately broken data saved.
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

test.describe("robustness with everything (and garbage) saved", () => {
  test.skip(({ isMobile }) => isMobile, "Runs on the desktop project");

  test.beforeEach(async ({ page }) => {
    await seed(page, {
      catalog: {
        patches: {
          i: { variants: [{ sku: "MS-I-50", size: { en: "50 ml", ar: "50 مل" }, priceFils: 21000, stock: 24 }] },
          mist: { hidden: true },
          aura: { category: "home" },
          oasis: { category: "nope" }, // invalid category → repaired to the base one
        },
        added: [
          CUSTOM_PRODUCT,
          { slug: "c-broken", name: "Broken", category: "body" }, // no variants/images → dropped
        ],
      },
      settings: {
        standardFeeFils: 1500,
        whatsapp: "96591234567",
        phone: "22223333",
        ticker: { en: ["Hello test"], ar: ["مرحبا"] },
      },
      // Deliberately broken home overrides: wrong types, blocked links, unknown products, a deleted
      // upload and a text with braces/apostrophes. cleanHome must drop all of it to the defaults.
      home: {
        hero: { title: 123, cta: { en: 456 }, href: "javascript:alert(1)" },
        trilogy: { products: "not-an-array" },
        story: { image: "u:missing", mobileImage: "https://evil.example/x.jpg" },
        duo: { items: "nope" },
        feature: { product: "totally-unknown-product", image: "u:missing" },
        film: { href: "https://evil.example", eyebrow: { en: "has { and ' chars" } },
        homeGrid: { products: [123, {}] },
        services: { items: [{ text: { en: "cost {fee} and {bogus}" } }], whatsappText: { en: 5 } },
        instagram: { photos: ["u:missing", "https://evil.example", 42], subtitle: 999 },
        bogusSection: { foo: "bar" },
      },
    });
  });

  for (const path of PAGES) {
    test(`${path} loads cleanly with edits saved`, async ({ page }) => {
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

  test("garbage home overrides fall back to the defaults and hide an unknown featured product", async ({ page }) => {
    await page.goto("/en/");
    // The built-in hero text and link are shown despite the garbage overrides.
    await expect(page.locator("#hero-title")).toHaveText("Timeless scents that capture the moment");
    await expect(page.locator('[data-home-section="hero"]').getByRole("link")).toHaveAttribute("href", /\/en\/shop\/perfumes\/$/);
    // The featured product was unknown → the panel is hidden entirely.
    await expect(page.locator("#aura-title")).toHaveCount(0);
    await expect(page.locator('[data-home-section="feature"]')).toHaveCount(0);
  });
});

test.describe("ms-home with unreadable JSON", () => {
  test.skip(({ isMobile }) => isMobile, "Runs on the desktop project");

  for (const path of ["/en/", "/ar/"]) {
    test(`${path} ignores an invalid ms-home value and shows the defaults`, async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem("ms-home", "{not valid json"));
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
