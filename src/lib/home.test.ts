import { describe, expect, it } from "vitest";

import { cleanHome, type HomeOverrides, isHomeHref, isHomeImageKey } from "./home";

// Pure-function unit coverage for the home-override sanitiser (src/lib/home.ts). No DB, no React.

describe("isHomeImageKey", () => {
  it("accepts a manifest key or an upload key, rejects anything else", () => {
    expect(isHomeImageKey("lifestyle/hourglass-candles")).toBe(true);
    expect(isHomeImageKey("u:abc_123-XYZ")).toBe(true);
    expect(isHomeImageKey("not-a-real-key")).toBe(false);
    expect(isHomeImageKey(42)).toBe(false);
  });
});

describe("isHomeHref", () => {
  it("accepts the shop, collections and fixed pages", () => {
    expect(isHomeHref("/shop")).toBe(true);
    expect(isHomeHref("/shop/perfumes")).toBe(true);
    expect(isHomeHref("/shop/oud")).toBe(true);
    expect(isHomeHref("/contact")).toBe(true);
    expect(isHomeHref("/faq")).toBe(true);
  });

  it("accepts a base product link but NOT a custom slug on the base path", () => {
    expect(isHomeHref("/product/aura")).toBe(true);
    expect(isHomeHref("/product/c-x")).toBe(false);
  });

  it("accepts a custom product query link but NOT a base slug on the custom path", () => {
    expect(isHomeHref("/product?p=c-x")).toBe(true);
    expect(isHomeHref("/product?p=aura")).toBe(false);
  });

  it("rejects unknown links and non-strings", () => {
    expect(isHomeHref("/evil")).toBe(false);
    expect(isHomeHref("/shop/not-a-category")).toBe(false);
    expect(isHomeHref(123)).toBe(false);
  });
});

describe("cleanHome", () => {
  it("returns {} for a non-object", () => {
    expect(cleanHome(null)).toEqual({});
    expect(cleanHome("x")).toEqual({});
    expect(cleanHome([])).toEqual({});
  });

  it("drops unknown sections and keeps known ones", () => {
    const out = cleanHome({
      bogus: { anything: true },
      hero: { title: { en: "Hi", ar: "مرحبا" } },
    });
    expect(out).toEqual({ hero: { title: { en: "Hi", ar: "مرحبا" } } });
    expect("bogus" in out).toBe(false);
  });

  it("drops unknown keys inside a section", () => {
    const out = cleanHome({ hero: { title: { en: "Hi", ar: "مرحبا" }, junk: "x" } });
    expect(out.hero).toEqual({ title: { en: "Hi", ar: "مرحبا" } });
  });

  it("drops an over-limit language but keeps the within-limit one", () => {
    const longEn = "a".repeat(81); // heroTitle cap is 80
    const out = cleanHome({ hero: { title: { en: longEn, ar: "عنوان" } } });
    expect(out.hero?.title).toEqual({ ar: "عنوان" });
  });

  it("drops a section once every field is empty / blank", () => {
    expect(cleanHome({ hero: {} }).hero).toBeUndefined();
    expect(cleanHome({ hero: { title: { en: "   ", ar: "" } } }).hero).toBeUndefined();
  });

  it("trims text and drops blank languages", () => {
    const out = cleanHome({ hero: { title: { en: "  Hi  ", ar: "   " } } });
    expect(out.hero?.title).toEqual({ en: "Hi" });
  });

  it("caps a product list to 8, dedupes it and drops invalid slugs", () => {
    const out = cleanHome({
      trilogy: { products: ["a", "a", "b", "BAD", "", "c", "d", "e", "f", "g", "h", "i"] },
    });
    // Deduped (one "a"), "BAD"/"" dropped, then capped to 8.
    expect(out.trilogy?.products).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
  });

  it("validates hrefs and images, dropping invalid ones", () => {
    const out = cleanHome({
      hero: { href: "/evil" },
      story: { href: "/shop", image: "lifestyle/hourglass-candles", mobileImage: "bad-key" },
    });
    expect(out.hero).toBeUndefined(); // only an invalid href → section empty
    expect(out.story).toEqual({ href: "/shop", image: "lifestyle/hourglass-candles" });
  });

  it("maps invalid instagram photos to '' and keeps the valid tiles", () => {
    const out = cleanHome({ instagram: { photos: ["renders/aura", "bad", "renders/mist"] } });
    expect(out.instagram?.photos).toEqual(["renders/aura", "", "renders/mist"]);
  });

  it("caps services items to 3 and duo items to 2", () => {
    const out = cleanHome({
      services: {
        items: [
          { title: { en: "A", ar: "أ" } },
          { title: { en: "B", ar: "ب" } },
          { title: { en: "C", ar: "ج" } },
          { title: { en: "D", ar: "د" } },
        ],
      },
      duo: {
        items: [{ product: "aura" }, { product: "oud" }, { product: "cafe" }],
      },
    });
    expect(out.services?.items).toHaveLength(3);
    expect(out.duo?.items).toHaveLength(2);
  });

  it("round-trips a fully-valid set of overrides unchanged", () => {
    const valid: HomeOverrides = {
      hero: {
        eyebrow: { en: "New", ar: "جديد" },
        title: { en: "Mystic Sand", ar: "رمال غامضة" },
        cta: { en: "Shop", ar: "تسوّق" },
        href: "/shop/perfumes",
      },
      trilogy: { title: { en: "The Trilogy", ar: "الثلاثية" }, products: ["i", "ii", "iii"] },
      story: {
        title: { en: "Our craft", ar: "حرفتنا" },
        href: "/shop",
        image: "lifestyle/hourglass-candles",
        mobileImage: "lifestyle/candles-duo",
      },
      feature: { product: "aura", image: "renders/aura", eyebrow: { en: "Signature", ar: "توقيع" } },
      instagram: { photos: ["renders/aura", "renders/mist"], subtitle: { en: "Follow", ar: "تابعنا" } },
    };
    expect(cleanHome(valid)).toEqual(valid);
  });
});
