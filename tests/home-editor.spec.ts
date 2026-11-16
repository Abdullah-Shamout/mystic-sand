import { expect, test, type Frame, type Page } from "@playwright/test";

import { readHomeRow, seedImageRow } from "./db";

// The admin "Home page" editor writes the home_overrides singleton via a Server Action
// (saveHomeSection / resetAllHome) and the top banner to the DB settings via saveSettings, with a
// live preview beside it. These flows inject the admin session, drive the editor, and check the DB
// row and the storefront reflect the edits. Any test that mutates the home singleton resets it
// through the editor in a finally (the reset calls updateTag, so the shared home cache is purged —
// a raw DB delete would leave the stale override cached for other specs).

const FAR_FUTURE = 4102444800000; // ~ year 2100 (ms)

async function signIn(page: Page) {
  await page.addInitScript((exp) => {
    try {
      sessionStorage.setItem("ms-admin-session", JSON.stringify({ u: "admin", exp }));
    } catch {
      // storage blocked
    }
  }, FAR_FUTURE);
}

type Seed = {
  home?: Record<string, unknown>;
  catalog?: { patches?: Record<string, unknown>; added?: unknown[]; categories?: Record<string, unknown> };
  settings?: Record<string, unknown>;
};

async function seed(page: Page, data: Seed) {
  await page.addInitScript((d) => {
    if (d.home) localStorage.setItem("ms-home", JSON.stringify({ state: { overrides: d.home }, version: 1 }));
    if (d.catalog) {
      const edits = { patches: {}, added: [], categories: {}, ...d.catalog };
      localStorage.setItem("ms-catalog", JSON.stringify({ state: { edits }, version: 1 }));
    }
    // Skipped Phase-8 tests still pass `settings`; harmless (nothing reads ms-settings anymore).
    if (d.settings) localStorage.setItem("ms-settings", JSON.stringify({ state: { overrides: d.settings }, version: 1 }));
  }, data);
}

const section = (page: Page, id: string) => page.locator(`[data-home-section="${id}"]`);

/**
 * Cleanup for an editor-driven test: reopen the editor and reset the given section if it still carries
 * an override. The reset goes through the Server Action (updateTag purges the shared home cache),
 * leaving the singleton at its built-in defaults for the other specs. Guarded on `isEnabled()` so a
 * test that failed before it saved doesn't wait out the timeout on a disabled Reset button.
 */
async function resetSectionIfEdited(page: Page, id: string) {
  await page.goto("/en/admin/home/");
  await page.getByTestId(`home-section-${id}-toggle`).click();
  const reset = page.getByTestId(`home-${id}-reset`);
  if (await reset.isEnabled()) {
    await reset.click();
    await page.getByTestId("confirm-accept").click();
    await expect(page.getByText("Section reset to the original.").first()).toBeVisible();
  }
}

// A complete, valid admin-added product (passes the catalog's normalizeAdded checks).
const CUSTOM_PRODUCT = {
  slug: "c-amber-nights-test",
  name: "Amber Nights",
  category: "body",
  type: { en: "Body mist", ar: "رذاذ للجسم" },
  tagline: { en: "A warm amber veil.", ar: "رذاذ عنبري دافئ." },
  description: { en: "A warm amber veil for skin, hair and clothes.", ar: "رذاذ عنبري دافئ." },
  howTo: { en: "Spritz over skin and hair.", ar: "رشّ على البشرة والشعر." },
  variants: [{ sku: "MS-TEST01", size: { en: "100 ml", ar: "100 مل" }, priceFils: 9500, stock: 5 }],
  images: { card: "renders/aura", gallery: ["renders/aura"] },
  related: [],
  aliases: [],
  todo: [],
};

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWM4UaGBFTEMLQkAUtVaAUH78mEAAAAASUVORK5CYII=",
  "base64",
);

async function previewFrame(page: Page): Promise<Frame> {
  const handle = await page.waitForSelector('[data-testid="home-preview-frame"]');
  const frame = await handle.contentFrame();
  if (!frame) throw new Error("preview frame not found");
  return frame;
}

test.describe("admin home-page editor", () => {
  test.skip(({ isMobile }) => isMobile, "Long flows + preview run on the desktop project (≥1280px)");

  test("the tab is listed and current, with 10 numbered sections and no console errors", async ({ page }) => {
    await signIn(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });

    for (const url of ["/en/admin/home/", "/ar/admin/home/"]) {
      await page.goto(url, { waitUntil: "networkidle" });
      await expect(page.getByTestId("home-section-ticker")).toBeVisible();
      await page.waitForTimeout(500);
    }

    // Back to English for the structural checks.
    await page.goto("/en/admin/home/");
    const tab = page.getByRole("link", { name: "Home page", exact: true });
    await expect(tab).toBeVisible();
    await expect(tab).toHaveAttribute("aria-current", "page");

    await expect(page.locator('section[data-testid^="home-section-"]')).toHaveCount(10);
    // The first card is the top banner, numbered 1.
    await expect(page.getByTestId("home-section-ticker")).toContainText("1");

    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("hero title + link saved to the DB, storing only the changed fields; shown on the store", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/home/");
    await page.getByTestId("home-section-hero-toggle").click();
    try {
      await page.getByTestId("home-hero-title-en").fill("A new hero headline");
      await page.getByTestId("home-hero-title-ar").fill("عنوان رئيسي جديد");
      await page.getByTestId("home-hero-link").selectOption("/shop/oud");
      await page.getByTestId("home-hero-save").click();
      await expect(page.getByText("Saved — now live on the home page for all visitors.").first()).toBeVisible();

      // Only the changed fields are stored (minimal override), written to the home_overrides singleton.
      expect(await readHomeRow()).toEqual({
        hero: { title: { en: "A new hero headline", ar: "عنوان رئيسي جديد" }, href: "/shop/oud" },
      });

      // The DB-backed preview frame remounts on save and shows the new title (the only coverage of
      // the preview's save-remount). frameLocator re-resolves the frame across the remount.
      await expect(page.frameLocator('[data-testid="home-preview-frame"]').locator("#hero-title")).toHaveText(
        "A new hero headline",
      );

      // The storefront reflects it in both languages. updateTag("home") makes this read-your-own-writes,
      // but reload-until-pass to be robust to any cache timing (mirrors the settings specs).
      await expect(async () => {
        await page.goto("/en/");
        await expect(page.locator("#hero-title")).toHaveText("A new hero headline", { timeout: 2000 });
      }).toPass({ timeout: 20000 });
      await expect(section(page, "hero").getByRole("link", { name: "Discover" })).toHaveAttribute(
        "href",
        /\/en\/shop\/oud\/$/,
      );

      await expect(async () => {
        await page.goto("/ar/");
        await expect(page.locator("#hero-title")).toHaveText("عنوان رئيسي جديد", { timeout: 2000 });
      }).toPass({ timeout: 20000 });
    } finally {
      await resetSectionIfEdited(page, "hero");
    }
  });

  test("clearing a field restores the original, and typing it back keeps Save disabled", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/home/");
    await page.getByTestId("home-section-hero-toggle").click();
    try {
      // Save a hero title override first (so there is something to clear).
      await page.getByTestId("home-hero-title-en").fill("Seeded headline");
      await page.getByTestId("home-hero-title-ar").fill("عنوان مُدخَل");
      await page.getByTestId("home-hero-save").click();
      await expect(page.getByText("Saved — now live on the home page for all visitors.").first()).toBeVisible();

      // Clear both languages and save → the hero override is removed entirely from the DB.
      await page.getByTestId("home-hero-title-en").fill("");
      await page.getByTestId("home-hero-title-ar").fill("");
      await page.getByTestId("home-hero-save").click();
      await expect(page.getByText("Saved — now live on the home page for all visitors.").first()).toBeVisible();
      expect(await readHomeRow()).toEqual({});

      // The field now shows the built-in text; typing it back keeps Save disabled.
      const save = page.getByTestId("home-hero-save");
      await expect(save).toBeDisabled();
      await page.getByTestId("home-hero-title-en").fill("Changed again");
      await expect(save).toBeEnabled();
      await page.getByTestId("home-hero-title-en").fill("Timeless scents that capture the moment");
      await expect(save).toBeDisabled();
    } finally {
      await resetSectionIfEdited(page, "hero");
    }
  });

  test("product rows: add a custom product, reorder, remove one; hidden products are skipped", async ({ page }) => {
    test.skip(true, "Phase 8 E2E rewrite");
    await signIn(page);
    await seed(page, { catalog: { added: [CUSTOM_PRODUCT], patches: { iii: { hidden: true } } } });
    await page.goto("/en/admin/home/");
    await page.getByTestId("home-section-trilogy-toggle").click();

    const trilogy = page.getByTestId("home-section-trilogy");
    // The hidden default product is tagged in the editor.
    await expect(trilogy).toContainText("Hidden");

    await page.getByTestId("home-trilogy-products-add").selectOption("c-amber-nights-test");
    await page.getByRole("button", { name: "Move Amber Nights up" }).click(); // [i, ii, custom, iii]
    await page.getByRole("button", { name: "Remove II", exact: true }).click(); // [i, custom, iii]
    await page.getByTestId("home-trilogy-save").click();
    await expect(page.getByText("Saved — now live on the home page for all visitors.").first()).toBeVisible();

    await page.goto("/en/");
    // iii is hidden → skipped; order is I then Amber Nights.
    await expect(section(page, "trilogy").locator("article h3")).toHaveText(["I", "Amber Nights"]);
  });

  test("story photo from the library (phones follow it) and from an upload", async ({ page }) => {
    test.skip(true, "Phase 8 E2E rewrite");
    await signIn(page);
    await page.goto("/en/admin/home/");
    await page.getByTestId("home-section-story-toggle").click();

    await page.getByTestId("home-story-image-choose").click();
    await page.locator('[data-key="renders/oasis"]').click();
    await page.getByTestId("library-add").click();
    await page.getByTestId("home-story-save").click();
    await expect(page.getByText("Saved — now live on the home page for all visitors.").first()).toBeVisible();

    await page.goto("/en/");
    const imgs = section(page, "story").locator("img");
    await expect(imgs).toHaveCount(2);
    for (let i = 0; i < 2; i++) await expect(imgs.nth(i)).toHaveAttribute("src", /renders\/oasis/);

    // Phones follow the computer photo.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/");
    await expect(section(page, "story").locator("img[src*='renders/oasis']").first()).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });

    // Now replace it with an upload.
    await page.goto("/en/admin/home/");
    await page.getByTestId("home-section-story-toggle").click();
    await page.getByTestId("home-story-image-upload-input").setInputFiles({ name: "shot.png", mimeType: "image/png", buffer: TINY_PNG });
    await page.getByTestId("home-story-save").click();
    await expect(page.getByText("Saved — now live on the home page for all visitors.").first()).toBeVisible();

    // Phase 8: assert the stored override via readHomeRow() (DB) when this flow is restored.
    await page.goto("/en/");
    await expect(section(page, "story").locator("img").first()).toHaveAttribute("src", /^data:image\//);
  });

  // Scope note: the multi-size and hidden-panel sub-cases of the old test needed ms-catalog seeding
  // (Phase 3c), so this restores only the DB-reflectable CAFÉ change.
  test("the featured product can be changed to CAFÉ and shown on the store", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/home/");
    await page.getByTestId("home-section-feature-toggle").click();
    try {
      await page.getByTestId("home-feature-product").selectOption("cafe");
      await page.getByTestId("home-feature-save").click();
      await expect(page.getByText("Saved — now live on the home page for all visitors.").first()).toBeVisible();
      expect(await readHomeRow()).toEqual({ feature: { product: "cafe" } });

      await expect(async () => {
        await page.goto("/en/");
        await expect(page.locator("#aura-title")).toHaveText("CAFÉ", { timeout: 2000 });
      }).toPass({ timeout: 20000 });
      await expect(section(page, "feature").locator("img")).toHaveAttribute("src", /renders\/cafe/);
      await expect(page.getByTestId("feature-add-cafe")).toBeVisible();
    } finally {
      await resetSectionIfEdited(page, "feature");
    }
  });

  test("a duo slot can be changed to another product and shown on the store", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/home/");
    await page.getByTestId("home-section-duo-toggle").click();
    try {
      await page.getByTestId("home-duo-1-product").selectOption("mist");
      await page.getByTestId("home-duo-save").click();
      await expect(page.getByText("Saved — now live on the home page for all visitors.").first()).toBeVisible();

      await expect(async () => {
        await page.goto("/en/");
        await expect(section(page, "duo").locator('a[href$="/product/mist/"]')).toHaveCount(1, { timeout: 2000 });
      }).toPass({ timeout: 20000 });
    } finally {
      await resetSectionIfEdited(page, "duo");
    }
  });

  test("a service text keeps its tokens, filled with the live fee and lead time", async ({ page }) => {
    test.skip(true, "Phase 8 E2E rewrite");
    await signIn(page);
    await seed(page, { settings: { standardFeeFils: 1500 } });
    await page.goto("/en/admin/home/");
    await page.getByTestId("home-section-services-toggle").click();
    await page.getByTestId("home-services-delivery-text-en").fill("Only {fee} — arrives {when}.");
    await page.getByTestId("home-services-save").click();
    await expect(page.getByText("Saved — now live on the home page for all visitors.").first()).toBeVisible();

    await page.goto("/en/");
    await expect(section(page, "services")).toContainText(/Only\s*.?KWD 1\.500.?\s*—\s*arrives the next day\./);
  });

  test("an Instagram tile and the caption follow the edits", async ({ page }) => {
    test.skip(true, "Phase 8 E2E rewrite");
    await signIn(page);
    await page.goto("/en/admin/home/");
    await page.getByTestId("home-section-instagram-toggle").click();
    await page.getByTestId("home-instagram-photo-1-choose").click();
    await page.locator('[data-key="renders/dune"]').click();
    await page.getByTestId("library-add").click();
    await page.getByTestId("home-instagram-subtitle-en").fill("A fresh caption");
    await page.getByTestId("home-instagram-save").click();
    await expect(page.getByText("Saved — now live on the home page for all visitors.").first()).toBeVisible();

    await page.goto("/en/");
    const band = section(page, "instagram");
    await expect(band.locator("li").nth(1).locator("img")).toHaveAttribute("src", /renders\/dune/);
    await expect(band).toContainText("A fresh caption");
  });

  test("reset section brings back the original and clears the home_overrides row", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/home/");
    await page.getByTestId("home-section-hero-toggle").click();
    try {
      // Save a hero title override first.
      await page.getByTestId("home-hero-title-en").fill("A seeded headline");
      await page.getByTestId("home-hero-title-ar").fill("عنوان مُدخَل");
      await page.getByTestId("home-hero-save").click();
      await expect(page.getByText("Saved — now live on the home page for all visitors.").first()).toBeVisible();
      await expect(page.getByTestId("home-hero-title-en")).toHaveValue("A seeded headline");

      // Reset the section → the built-in text comes back and the override is cleared from the DB.
      await page.getByTestId("home-hero-reset").click();
      await page.getByTestId("confirm-accept").click();
      await expect(page.getByText("Section reset to the original.").first()).toBeVisible();

      expect(await readHomeRow()).toEqual({});
      await expect(page.getByTestId("home-hero-title-en")).toHaveValue("Timeless scents that capture the moment");
    } finally {
      await resetSectionIfEdited(page, "hero");
    }
  });

  test("the top banner is edited here, shows per language, and resets to built-in", async ({ page }) => {
    test.skip(true, "Phase 8 E2E rewrite");
    await signIn(page);
    await page.goto("/en/admin/home/");
    await page.getByTestId("home-section-ticker-toggle").click();
    await page.getByTestId("ticker-en-add").click();
    await page.getByTestId("ticker-en-input-0").fill("Hello test");
    await page.getByTestId("ticker-ar-add").click();
    await page.getByTestId("ticker-ar-input-0").fill("مرحبا");
    await page.getByTestId("home-ticker-save").click();
    await expect(page.getByText("Saved — now live on the home page for all visitors.").first()).toBeVisible();

    await page.goto("/en/");
    await expect(page.getByRole("region", { name: "Announcements" })).toContainText("Hello test");
    await page.goto("/ar/");
    await expect(page.getByRole("region", { name: "الإعلانات" })).toContainText("مرحبا");

    // Reset the banner section → built-in messages come back.
    await page.goto("/en/admin/home/");
    await page.getByTestId("home-section-ticker-toggle").click();
    await page.getByTestId("home-ticker-reset").click();
    await page.getByTestId("confirm-accept").click();
    await page.goto("/en/");
    await expect(page.getByRole("region", { name: "Announcements" })).toContainText("Pay securely with KNET, Apple Pay or card");
  });

  test("the settings page no longer has a ticker editor", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/settings/");
    await expect(page.getByTestId("ticker-save")).toHaveCount(0);
    await expect(page.getByTestId("home-ticker-save")).toHaveCount(0);
    await expect(page.getByTestId("ticker-en-add")).toHaveCount(0);
    // There is a link to the home page editor instead.
    await expect(page.getByRole("link", { name: "Home page" }).first()).toBeVisible();
  });

  test("the preview updates on save without a reload, scrolls to the open section, and blocks links", async ({ page }) => {
    test.skip(true, "Phase 8 E2E rewrite");
    await signIn(page);
    await page.goto("/en/admin/home/");
    await page.getByTestId("home-section-hero-toggle").click();

    const frame = await previewFrame(page);
    await expect(frame.locator("#hero-title")).toBeVisible();
    await frame.evaluate(() => {
      (window as unknown as { __marker?: number }).__marker = 1;
    });

    await page.getByTestId("home-hero-title-en").fill("Preview marker title");
    await page.getByTestId("home-hero-save").click();
    await expect(frame.locator("#hero-title")).toHaveText("Preview marker title");
    expect(await frame.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(1);

    // Opening Instagram scrolls the frame so that section is in view.
    await page.getByTestId("home-section-instagram-toggle").click();
    await expect
      .poll(async () =>
        frame.evaluate(() => {
          const el = document.querySelector('[data-home-section="instagram"]');
          if (!el) return false;
          const r = el.getBoundingClientRect();
          return r.top < window.innerHeight && r.bottom > 0;
        }),
      )
      .toBe(true);

    // Clicking a product link inside the frame does not navigate it.
    const urlBefore = frame.url();
    await frame.locator('[data-home-section="trilogy"] a').first().dispatchEvent("click");
    await page.waitForTimeout(300);
    expect(frame.url()).toBe(urlBefore);
  });

  test("below 1280px shows a 'View home page' link and no iframe; no overflow at 390px", async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto("/en/admin/home/");
    const link = page.getByTestId("home-view-store");
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(page.getByTestId("home-preview-frame")).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/admin/home/");
    await page.getByTestId("home-section-hero-toggle").click();
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflows, "horizontal overflow at 390px").toBe(false);
  });

  test("the library delete warning mentions the home page when a photo is used there", async ({ page }) => {
    await signIn(page);
    // The library lists uploads from the DB images table; seed a row so it appears without a real file.
    await seedImageRow("testupload1");
    try {
      // Reference the upload on the home page by saving it into an Instagram slot (the live-home read
      // for the delete warning now comes from the DB, not ms-home).
      await page.goto("/en/admin/home/");
      await page.getByTestId("home-section-instagram-toggle").click();
      await page.getByTestId("home-instagram-photo-0-choose").click();
      await page.locator('[data-key="u:testupload1"]').click();
      await page.getByTestId("library-add").click();
      await page.getByTestId("home-instagram-save").click();
      await expect(page.getByText("Saved — now live on the home page for all visitors.").first()).toBeVisible();

      // Reload so the editor's live-home context certainly reflects the saved photo, then reopen the
      // library: deleting the upload warns that it's still used on the home page.
      await page.goto("/en/admin/home/");
      await page.getByTestId("home-section-instagram-toggle").click();
      await page.getByTestId("home-instagram-photo-0-choose").click();
      await page.locator('li:has([data-key="u:testupload1"]) [data-testid="library-upload-delete"]').click();
      await expect(page.getByText(/also used on the home page/i)).toBeVisible();
    } finally {
      await resetSectionIfEdited(page, "instagram");
    }
  });

  test("re-picking the current automatic photo creates no edit", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/home/");
    await page.getByTestId("home-section-feature-toggle").click();
    // The featured photo is AURA's automatic scene photo (renders/aura); re-picking it must not pin it.
    await page.getByTestId("home-feature-image-choose").click();
    await page.locator('[data-key="renders/aura"]').click();
    await page.getByTestId("library-add").click();
    await expect(page.getByTestId("home-feature-save")).toBeDisabled();
    // Nothing was saved, so the home_overrides singleton stays empty (no stray override written).
    expect(await readHomeRow()).toEqual({});
  });

  test("a top-banner message over 90 characters is blocked on save", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/home/");
    await page.getByTestId("home-section-ticker-toggle").click();
    await page.getByTestId("ticker-en-add").click();
    // Bypass the input maxLength to simulate a 91-char value (pasted or restored).
    await page.getByTestId("ticker-en-input-0").evaluate((el, v) => {
      const input = el as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, v);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, "x".repeat(91));
    await page.getByTestId("home-ticker-save").click();
    await expect(page.getByText("Some text is too long. Please shorten it.")).toBeVisible();
    // The client blocks the save before any Server Action call, so nothing is written.
  });

  test("the preview re-scrolls on a device switch and after a reload", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/home/");
    const frame = await previewFrame(page);
    await expect(frame.locator("#hero-title")).toBeVisible();

    const inView = (f: Frame) =>
      f.evaluate(() => {
        const el = document.querySelector('[data-home-section="instagram"]');
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.top < window.innerHeight && r.bottom > 0;
      });

    await page.getByTestId("home-section-instagram-toggle").click();
    await expect.poll(() => inView(frame)).toBe(true);

    // Switching Computer → Phone re-scrolls to the open section (same frame, no remount).
    await page.getByTestId("home-preview-phone").click();
    await expect.poll(() => inView(frame)).toBe(true);

    // Reloading the frame re-scrolls to the open section (no stale jump to the top).
    await page.getByTestId("home-preview-desktop").click();
    await page.getByRole("button", { name: "Reload" }).click();
    const frame2 = await previewFrame(page);
    await expect(frame2.locator("#hero-title")).toBeVisible();
    await expect.poll(() => inView(frame2)).toBe(true);
  });

  test("the computer preview fills its stage (no big empty gap)", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/home/");
    const frame = await previewFrame(page);
    await expect(frame.locator("#hero-title")).toBeVisible();
    const stage = await page.getByTestId("home-preview-stage").boundingBox();
    const frameBox = await page.getByTestId("home-preview-frame").boundingBox();
    expect(stage).not.toBeNull();
    expect(frameBox).not.toBeNull();
    // The scaled frame fills its stage: the stage is the frame's height, not a tall grey panel.
    expect(Math.abs(stage!.height - frameBox!.height)).toBeLessThan(8);
    expect(frameBox!.height).toBeGreaterThan(200);
  });

  test("unsaved drafts survive leaving and returning to the page", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/home/");
    await page.getByTestId("home-section-hero-toggle").click();
    await page.getByTestId("home-hero-title-en").fill("Draft kept across nav");

    // Leave to another admin tab, then come back — the unsaved draft is restored.
    await page.goto("/en/admin/products/");
    await page.goto("/en/admin/home/");
    await page.getByTestId("home-section-hero-toggle").click();
    await expect(page.getByTestId("home-hero-title-en")).toHaveValue("Draft kept across nav");
    await expect(page.getByTestId("home-hero-save")).toBeEnabled();
  });

  test("the home page renders cleanly, including the WhatsApp concierge link", async ({ page }) => {
    // Phase 8: add E2E coverage that a garbage / malformed DB override falls back to the defaults.
    // cleanHome's resilience (incl. the lone-surrogate / "URI malformed" case) is unit-tested, and the
    // storefront sanitises server-side, so — unlike the old ms-home era — there is nothing meaningful
    // to seed from the browser (a lone surrogate can't even live in a jsonb column). This stays a smoke
    // check that the home page and its WhatsApp link render.
    await page.goto("/en/");
    await expect(page.locator("#hero-title")).toBeVisible();
    await expect(page.locator('a[href*="wa.me"]').first()).toBeVisible();
  });

  test("a home store saved under another version loads without a console error", async ({ page }) => {
    test.skip(true, "Phase 8 E2E rewrite");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });
    await page.addInitScript(() => {
      localStorage.setItem(
        "ms-home",
        JSON.stringify({ state: { overrides: { hero: { title: { en: "Versioned headline", ar: "عنوان" } } } }, version: 99 }),
      );
    });
    await page.goto("/en/");
    await expect(page.locator("#hero-title")).toHaveText("Versioned headline");
    expect(errors.join("\n")).not.toMatch(/migrat/i);
  });

  test("a long unbroken word in a home title does not overflow at 390px", async ({ page }) => {
    test.skip(true, "Phase 8 E2E rewrite");
    await page.setViewportSize({ width: 390, height: 844 });
    const token = "A".repeat(40);
    await page.addInitScript((tok) => {
      localStorage.setItem(
        "ms-home",
        JSON.stringify({ state: { overrides: { hero: { title: { en: tok, ar: tok } }, trilogy: { title: { en: tok, ar: tok } } } }, version: 1 }),
      );
    }, token);
    await page.goto("/en/");
    await expect(page.locator("#hero-title")).toHaveText(token);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow, "horizontal overflow with a long token at 390px").toBe(false);
  });

  test("the active tab is scrolled into view on a direct phone-width load", async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/admin/home/");
    await expect(page.getByRole("link", { name: "Home page", exact: true })).toBeInViewport();
  });

  test("the services token hint renders with literal braces (no ICU error)", async ({ page }) => {
    await signIn(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });
    await page.goto("/en/admin/home/");
    await page.getByTestId("home-section-services-toggle").click();
    await expect(page.getByTestId("home-section-services")).toContainText("{fee} shows the current delivery fee");
    expect(errors.join("\n")).not.toMatch(/FORMATTING_ERROR|IntlError/i);
  });
});
