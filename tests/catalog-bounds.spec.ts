import { expect, test } from "@playwright/test";

import { products as baseProducts } from "../src/data/products";
import type { Product } from "../src/data/types";
import { CATALOG_LIMITS, isProductEdited, normalizeAdded } from "../src/lib/catalog";

// Pure-function coverage for the catalog input-bounds cleaner (src/lib/catalog.ts). No browser — these
// assert normalizeAdded's A03 behaviour directly. (The dedicated vitest unit suite for these pure
// validators is Phase 8; this Playwright-hosted pure test is the interim coverage.) Relative imports,
// since the tests don't rely on the `@/` alias.

/** A complete, valid admin-added product used as the mutation baseline. */
const VALID: Product = {
  slug: "c-bounds-test",
  name: "Bounds Test",
  category: "perfumes",
  type: { en: "Eau de parfum", ar: "ماء عطر" },
  tagline: { en: "A test tagline", ar: "سطر تجريبي" },
  description: { en: "A valid product description.", ar: "وصف صالح للمنتج." },
  howTo: { en: "Spray on pulse points.", ar: "رُشّ على مواضع النبض." },
  variants: [{ sku: "C-BOUNDS-50", size: { en: "50 ml", ar: "٥٠ مل" }, priceFils: 19000, stock: 5 }],
  images: { card: "renders/i", gallery: ["renders/i"] },
  related: [],
  aliases: [],
  todo: [],
};

test.describe("catalog input bounds (pure)", () => {
  test("extra keys inside a Localized value are stripped from the output", () => {
    const input = { ...VALID, type: { en: "Scent", ar: "عطر", evil: "DROP ME" } } as unknown as Product;
    const out = normalizeAdded(input);
    expect(out).not.toBeNull();
    expect(Object.keys(out!.type).sort()).toEqual(["ar", "en"]);
    expect(JSON.stringify(out)).not.toContain("DROP ME");
  });

  test("an over-length en on a required Localized field makes normalizeAdded return null", () => {
    const tooLong = "a".repeat(CATALOG_LIMITS.type + 1);
    const input = { ...VALID, type: { en: tooLong, ar: "عطر" } } as unknown as Product;
    expect(normalizeAdded(input)).toBeNull();
  });

  test("over-long related / aliases / gallery / notes lists are capped to their limits", () => {
    const strings = (n: number, p: string) => Array.from({ length: n }, (_, i) => `${p}${i}`);
    const input = {
      ...VALID,
      related: strings(CATALOG_LIMITS.related + 20, "r"),
      aliases: strings(CATALOG_LIMITS.aliases + 20, "a"),
      images: { card: "renders/i", gallery: strings(CATALOG_LIMITS.gallery + 20, "renders/g-") },
      notes: {
        top: Array.from({ length: CATALOG_LIMITS.notesPerList + 20 }, (_, i) => ({ en: `t${i}`, ar: `ع${i}` })),
        heart: [{ en: "Heart", ar: "قلب" }],
        base: [{ en: "Base", ar: "قاعدة" }],
      },
    } as unknown as Product;
    const out = normalizeAdded(input);
    expect(out).not.toBeNull();
    expect(out!.related).toHaveLength(CATALOG_LIMITS.related);
    expect(out!.aliases).toHaveLength(CATALOG_LIMITS.aliases);
    expect(out!.images.gallery).toHaveLength(CATALOG_LIMITS.gallery);
    expect(out!.notes).not.toBeUndefined();
    expect(out!.notes!.top).toHaveLength(CATALOG_LIMITS.notesPerList);
  });

  test("every valid seed product round-trips through normalizeAdded unchanged", () => {
    // Confirms the caps sit comfortably above the real seed fields: each base product is accepted and,
    // once cleaned, reads as NOT edited (same shape as its src/data seed on the compared fields).
    for (const p of baseProducts) {
      const out = normalizeAdded(p);
      expect(out, `normalizeAdded rejected seed product ${p.slug}`).not.toBeNull();
      expect(isProductEdited(out!), `seed product ${p.slug} was altered by normalizeAdded`).toBe(false);
    }
  });
});
