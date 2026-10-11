import { expect, test, type Page } from "@playwright/test";

// The home page reads the admin's home-page edits (ms-home), the catalog (ms-catalog) and settings
// (ms-settings) from this browser. These tests seed those stores in the zustand persist format
// before the page loads, then check each section reflects the edit. Run `npm run build` first.

type Home = Record<string, unknown>;
type Edits = { patches?: Record<string, unknown>; added?: unknown[]; categories?: Record<string, unknown> };

async function seed(page: Page, data: { home?: Home; catalog?: Edits; settings?: Record<string, unknown> }) {
  await page.addInitScript((d) => {
    if (d.home) {
      localStorage.setItem("ms-home", JSON.stringify({ state: { overrides: d.home }, version: 1 }));
    }
    if (d.catalog) {
      const edits = { patches: {}, added: [], categories: {}, ...d.catalog };
      localStorage.setItem("ms-catalog", JSON.stringify({ state: { edits }, version: 1 }));
    }
    if (d.settings) {
      localStorage.setItem("ms-settings", JSON.stringify({ state: { overrides: d.settings }, version: 1 }));
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

const section = (page: Page, id: string) => page.locator(`[data-home-section="${id}"]`);

test.describe("live home page edits", () => {
  test.skip(({ isMobile }) => isMobile, "Runs on the desktop project");

  test("hero title, button and link follow the edits in English and Arabic", async ({ page }) => {
    await seed(page, {
      home: {
        hero: {
          title: { en: "A seeded hero headline", ar: "عنوان رئيسي تجريبي" },
          cta: { en: "Shop oud", ar: "تسوّق العود" },
          href: "/shop/oud",
        },
      },
    });

    await page.goto("/en/");
    await expect(page.locator("#hero-title")).toHaveText("A seeded hero headline");
    const cta = section(page, "hero").getByRole("link", { name: "Shop oud" });
    await expect(cta).toHaveAttribute("href", /\/en\/shop\/oud\/$/);

    await page.goto("/ar/");
    await expect(page.locator("#hero-title")).toHaveText("عنوان رئيسي تجريبي");
    const ctaAr = section(page, "hero").getByRole("link", { name: "تسوّق العود" });
    await expect(ctaAr).toHaveAttribute("href", /\/ar\/shop\/oud\/$/);
  });

  test("trilogy products are reordered, include a custom product and skip a hidden one", async ({ page }) => {
    await seed(page, {
      home: { trilogy: { products: ["c-amber-nights-test", "ii", "iii"] } },
      catalog: { added: [CUSTOM_PRODUCT], patches: { ii: { hidden: true } } },
    });

    await page.goto("/en/");
    // ii is hidden → skipped; the custom product leads, then III. toHaveText reads textContent (not
    // the CSS-uppercased render) and waits for the post-mount swap, asserting the order too.
    await expect(section(page, "trilogy").locator("article h3")).toHaveText(["Amber Nights", "III"]);
  });

  test("the story photo is used on desktop, and phones follow it when no phone photo is set", async ({ page }) => {
    await seed(page, { home: { story: { image: "renders/oasis" } } });

    await page.goto("/en/");
    const imgs = section(page, "story").locator("img");
    await expect(imgs).toHaveCount(2); // phone + desktop variants, both the custom photo
    for (let i = 0; i < 2; i++) {
      await expect(imgs.nth(i)).toHaveAttribute("src", /renders\/oasis/);
    }
  });

  test("a duo slot can be changed to another product", async ({ page }) => {
    await seed(page, { home: { duo: { items: [{}, { product: "mist" }] } } });

    await page.goto("/en/");
    const duo = section(page, "duo");
    await expect(duo.locator('a[href$="/product/mist/"]')).toHaveCount(1);
  });

  test("the featured product can be changed to CAFÉ", async ({ page }) => {
    await seed(page, { home: { feature: { product: "cafe" } } });

    await page.goto("/en/");
    await expect(page.locator("#aura-title")).toHaveText("CAFÉ");
    await expect(section(page, "feature").locator("img")).toHaveAttribute("src", /renders\/cafe/);
    await expect(page.getByTestId("feature-add-cafe")).toBeVisible();
  });

  test("the featured panel disappears when its product is hidden", async ({ page }) => {
    await seed(page, {
      home: { feature: { product: "cafe" } },
      catalog: { patches: { cafe: { hidden: true } } },
    });

    await page.goto("/en/");
    await expect(page.locator("#hero-title")).toBeVisible(); // the page rendered
    await expect(page.locator("#aura-title")).toHaveCount(0);
    await expect(section(page, "feature")).toHaveCount(0);
  });

  test("the film title follows the edit", async ({ page }) => {
    await seed(page, { home: { film: { title: { en: "A seeded film title", ar: "عنوان فيلم تجريبي" } } } });

    await page.goto("/en/");
    await expect(page.locator("#film-title")).toHaveText("A seeded film title");
  });

  test("a service text keeps its tokens, filled with the live fee and lead time", async ({ page }) => {
    await seed(page, {
      home: { services: { items: [{ text: { en: "Only {fee} — arrives {when}.", ar: "فقط {fee} — يصل {when}." } }] } },
      settings: { standardFeeFils: 1500 },
    });

    await page.goto("/en/");
    // isolatedKWD wraps the amount in U+2068/U+2069, so match with a regex rather than exact text.
    await expect(section(page, "services")).toContainText(/Only\s*.?KWD 1\.500.?\s*—\s*arrives the next day\./);
  });

  test("an Instagram tile and the caption follow the edits", async ({ page }) => {
    await seed(page, {
      home: { instagram: { photos: ["", "renders/dune", "", "", "", ""], subtitle: { en: "A seeded caption", ar: "تعليق تجريبي" } } },
    });

    await page.goto("/en/");
    const band = section(page, "instagram");
    await expect(band.locator('img[src*="renders/dune"]')).toHaveCount(1);
    await expect(band).toContainText("A seeded caption");
  });

  test("the static HTML is unchanged until an edit is saved", async ({ page }) => {
    const response = await page.request.get("/en/");
    expect(response.status()).toBe(200);
    const html = await response.text();
    // The built-in hero text is still in the prerendered HTML (edits only apply after mount).
    expect(html).toContain("Timeless scents that capture the moment");
    // Every section carries its preview anchor.
    for (const id of ["hero", "trilogy", "story", "duo", "feature", "film", "homeGrid", "services", "instagram"]) {
      expect(html).toContain(`data-home-section="${id}"`);
    }
  });
});
