import { describe, expect, it } from "vitest";

import { products as baseProducts } from "@/data/products";
import type { Product } from "@/data/types";

import {
  CATALOG_LIMITS,
  cleanAlsoIn,
  cleanLocalized,
  isProductEdited,
  normalizeAdded,
} from "./catalog";

// Pure-function unit coverage for the catalog input-bounds cleaner + edit detection (src/lib/catalog.ts).
// No browser — these assert the A03 validators directly. (Migrated from tests/catalog-bounds.spec.ts,
// which was the interim Playwright-hosted pure test; this is its permanent home.)

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

/** Asserts a normalized product is non-null and returns it (keeps the tests free of `!`). */
function expectProduct(p: Product | null): Product {
  expect(p).not.toBeNull();
  if (!p) throw new Error("expected normalizeAdded to return a product");
  return p;
}

describe("normalizeAdded (A03 input bounds)", () => {
  it("strips extra keys inside a Localized value", () => {
    const input = { ...VALID, type: { en: "Scent", ar: "عطر", evil: "DROP ME" } } as unknown as Product;
    const out = expectProduct(normalizeAdded(input));
    expect(Object.keys(out.type).sort()).toEqual(["ar", "en"]);
    expect(JSON.stringify(out)).not.toContain("DROP ME");
  });

  it("strips extra keys inside a Variant (rebuilt to exactly sku/size/priceFils/stock)", () => {
    const input = {
      ...VALID,
      variants: [
        { sku: "C-X-50", size: { en: "50 ml", ar: "٥٠ مل", evil: "DROP ME" }, priceFils: 19000, stock: 5, evil: "DROP ME" },
      ],
    } as unknown as Product;
    const out = expectProduct(normalizeAdded(input));
    expect(Object.keys(out.variants[0]).sort()).toEqual(["priceFils", "size", "sku", "stock"]);
    expect(JSON.stringify(out)).not.toContain("DROP ME");
  });

  it("strips extra keys inside Images (rebuilt to card/hover?/gallery)", () => {
    const input = {
      ...VALID,
      images: { card: "renders/i", gallery: ["renders/i"], evil: "DROP ME" },
    } as unknown as Product;
    const out = expectProduct(normalizeAdded(input));
    expect(Object.keys(out.images).sort()).toEqual(["card", "gallery"]);
    expect(JSON.stringify(out)).not.toContain("DROP ME");
  });

  it("strips extra keys inside Notes items and unknown note groups", () => {
    const input = {
      ...VALID,
      notes: {
        top: [{ en: "Citrus", ar: "حمضيات", evil: "DROP ME" }],
        heart: [{ en: "Rose", ar: "ورد" }],
        base: [{ en: "Musk", ar: "مسك" }],
        evil: [{ en: "x", ar: "x" }],
      },
    } as unknown as Product;
    const out = expectProduct(normalizeAdded(input));
    expect(Object.keys(out.notes ?? {}).sort()).toEqual(["base", "heart", "top"]);
    expect(Object.keys(out.notes?.top[0] ?? {}).sort()).toEqual(["ar", "en"]);
    expect(JSON.stringify(out)).not.toContain("DROP ME");
  });

  it("returns null when a required Localized field is over-length", () => {
    const tooLong = "a".repeat(CATALOG_LIMITS.type + 1);
    const input = { ...VALID, type: { en: tooLong, ar: "عطر" } } as unknown as Product;
    expect(normalizeAdded(input)).toBeNull();
  });

  it("caps over-long related / aliases / gallery / notes lists to their limits", () => {
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
    const out = expectProduct(normalizeAdded(input));
    expect(out.related).toHaveLength(CATALOG_LIMITS.related);
    expect(out.aliases).toHaveLength(CATALOG_LIMITS.aliases);
    expect(out.images.gallery).toHaveLength(CATALOG_LIMITS.gallery);
    expect(out.notes).not.toBeUndefined();
    expect(out.notes?.top).toHaveLength(CATALOG_LIMITS.notesPerList);
  });

  it("round-trips every valid seed product unchanged (accepted + reads as not edited)", () => {
    for (const p of baseProducts) {
      const out = expectProduct(normalizeAdded(p));
      expect(isProductEdited(out), `seed product ${p.slug} was altered by normalizeAdded`).toBe(false);
    }
  });
});

describe("cleanLocalized", () => {
  it("extracts only { en, ar }, trimmed", () => {
    expect(cleanLocalized({ en: "  Hi  ", ar: "  مرحبا  ", evil: "x" }, 60)).toEqual({ en: "Hi", ar: "مرحبا" });
  });

  it("returns null when a language is missing, non-string, or over-limit", () => {
    expect(cleanLocalized({ en: "Hi" }, 60)).toBeNull();
    expect(cleanLocalized({ en: 1, ar: "مرحبا" }, 60)).toBeNull();
    expect(cleanLocalized({ en: "a".repeat(61), ar: "مرحبا" }, 60)).toBeNull();
  });

  it("returns null for a non-object", () => {
    expect(cleanLocalized(null, 60)).toBeNull();
    expect(cleanLocalized([], 60)).toBeNull();
  });

  it("rejects a blank language unless allowBlank is set", () => {
    expect(cleanLocalized({ en: "   ", ar: "مرحبا" }, 60)).toBeNull();
    expect(cleanLocalized({ en: "   ", ar: "مرحبا" }, 60, true)).toEqual({ en: "", ar: "مرحبا" });
  });
});

describe("cleanAlsoIn", () => {
  it("keeps valid category slugs", () => {
    expect(cleanAlsoIn(["oud", "body"], "perfumes")).toEqual(["oud", "body"]);
  });

  it("drops the product's own category and any invalid slug, and dedupes", () => {
    expect(cleanAlsoIn(["perfumes", "oud"], "perfumes")).toEqual(["oud"]);
    expect(cleanAlsoIn(["bogus", "oud"], "perfumes")).toEqual(["oud"]);
    expect(cleanAlsoIn(["oud", "oud"], "perfumes")).toEqual(["oud"]);
  });

  it("returns [] for a non-array", () => {
    expect(cleanAlsoIn("oud", "perfumes")).toEqual([]);
    expect(cleanAlsoIn(undefined, "perfumes")).toEqual([]);
  });
});

describe("isProductEdited", () => {
  it("is false for an unmodified seed product", () => {
    expect(isProductEdited(structuredClone(baseProducts[0]))).toBe(false);
  });

  it("is true when an editable field (name) differs from the seed", () => {
    const edited = structuredClone(baseProducts[0]);
    edited.name = `${edited.name} (changed)`;
    expect(isProductEdited(edited)).toBe(true);
  });

  it("ignores a live stock change (stock is excluded from the comparison)", () => {
    const sold = structuredClone(baseProducts[0]);
    sold.variants[0].stock += 1;
    expect(isProductEdited(sold)).toBe(false);
  });

  it("is false for a custom (c-…) product, which has no seed to compare against", () => {
    expect(isProductEdited({ ...VALID, slug: "c-custom" })).toBe(false);
  });
});
