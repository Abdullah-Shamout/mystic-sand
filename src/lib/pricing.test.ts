import { describe, expect, it } from "vitest";

import type { Product } from "@/data/types";
import { indexCatalog, type Catalog } from "@/lib/catalog";
import type { StoreSettings } from "@/lib/settings";

import { bagKey, computeTotals, priceLines } from "./pricing";

// Pure pricing-layer unit coverage (src/lib/pricing.ts). Fixtures use fixed prices built with
// indexCatalog — never the seed prices, which are `todo` placeholders and may change. No DB.

function prod(slug: string, sku: string, priceFils: number, opts: { hidden?: boolean } = {}): Product {
  return {
    slug,
    name: slug.toUpperCase(),
    category: "perfumes",
    type: { en: "Eau de parfum", ar: "ماء عطر" },
    tagline: { en: "", ar: "" },
    description: { en: "A fixture product.", ar: "منتج تجريبي." },
    howTo: { en: "", ar: "" },
    variants: [{ sku, size: { en: "50 ml", ar: "٥٠ مل" }, priceFils, stock: 5 }],
    images: { card: "renders/i", gallery: ["renders/i"] },
    related: [],
    aliases: [],
    todo: [],
    ...(opts.hidden ? { hidden: true } : {}),
  };
}

// A = 10000 fils, B = 25000 fils, C = 3333 fils (odd, to exercise rounding), H = hidden.
const catalog: Catalog = indexCatalog(
  [
    prod("p-a", "A", 10000),
    prod("p-b", "B", 25000),
    prod("p-c", "C", 3333),
    prod("p-h", "H", 99000, { hidden: true }),
  ],
  [],
);

const settings: StoreSettings = {
  standardFeeFils: 1500,
  whatsapp: "96590000000",
  phone: "90000000",
  ticker: { en: [], ar: [] },
};

describe("priceLines", () => {
  it("prices a known SKU by qty and reports no missing lines", () => {
    const { priced, missing } = priceLines([{ sku: "A", qty: 2 }], catalog);
    expect(missing).toEqual([]);
    expect(priced).toHaveLength(1);
    expect(priced[0].lineFils).toBe(20000);
    expect(priced[0].product.slug).toBe("p-a");
  });

  it("reports an unknown SKU as missing", () => {
    const { priced, missing } = priceLines([{ sku: "NOPE", qty: 1 }], catalog);
    expect(priced).toEqual([]);
    expect(missing).toEqual([{ sku: "NOPE", qty: 1 }]);
  });

  it("treats a hidden product's SKU as missing", () => {
    const { priced, missing } = priceLines([{ sku: "H", qty: 1 }], catalog);
    expect(priced).toEqual([]);
    expect(missing).toEqual([{ sku: "H", qty: 1 }]);
  });
});

describe("computeTotals", () => {
  it("is all-zero for an empty bag (no delivery on an empty order)", () => {
    expect(computeTotals({ lines: [], catalog, settings })).toEqual({
      itemCount: 0,
      subtotalFils: 0,
      discountFils: 0,
      deliveryFils: 0,
      totalFils: 0,
    });
  });

  it("sums the subtotal and charges delivery on a non-empty order", () => {
    const t = computeTotals({ lines: [{ sku: "A", qty: 2 }, { sku: "B", qty: 1 }], catalog, settings });
    expect(t.itemCount).toBe(3);
    expect(t.subtotalFils).toBe(45000);
    expect(t.discountFils).toBe(0);
    expect(t.deliveryFils).toBe(1500);
    expect(t.totalFils).toBe(46500);
  });

  it("applies a promo percent to the subtotal before delivery", () => {
    const t = computeTotals({
      lines: [{ sku: "A", qty: 2 }, { sku: "B", qty: 1 }],
      promo: { code: "SAVE10", percent: 10 },
      catalog,
      settings,
    });
    expect(t.discountFils).toBe(4500); // 10% of 45000
    expect(t.totalFils).toBe(42000); // 45000 - 4500 + 1500
  });

  it("rounds the discount to the nearest fils", () => {
    // 3333 * 10% = 333.3 → Math.round → 333.
    const t = computeTotals({
      lines: [{ sku: "C", qty: 1 }],
      promo: { code: "SAVE10", percent: 10 },
      catalog,
      settings,
    });
    expect(t.discountFils).toBe(333);
    expect(t.totalFils).toBe(3333 - 333 + 1500);
  });

  it("charges delivery regardless of order size (no free-delivery threshold)", () => {
    const t = computeTotals({ lines: [{ sku: "B", qty: 10 }], catalog, settings });
    expect(t.subtotalFils).toBe(250000);
    expect(t.deliveryFils).toBe(1500);
  });

  it("charges no delivery when every line is missing or hidden", () => {
    const t = computeTotals({ lines: [{ sku: "NOPE", qty: 1 }, { sku: "H", qty: 2 }], catalog, settings });
    expect(t.itemCount).toBe(0);
    expect(t.subtotalFils).toBe(0);
    expect(t.deliveryFils).toBe(0);
    expect(t.totalFils).toBe(0);
  });

  it("ignores deliveryMethod (there is one delivery type)", () => {
    const lines = [{ sku: "A", qty: 1 }];
    const standard = computeTotals({ lines, deliveryMethod: "standard", catalog, settings });
    const express = computeTotals({ lines, deliveryMethod: "express", catalog, settings });
    expect(express).toEqual(standard);
  });
});

describe("bagKey", () => {
  it("sorts lines by SKU so order does not change the key", () => {
    const a = bagKey({ lines: [{ sku: "B", qty: 1 }, { sku: "A", qty: 2 }], deliveryMethod: "standard", promo: null });
    const b = bagKey({ lines: [{ sku: "A", qty: 2 }, { sku: "B", qty: 1 }], deliveryMethod: "standard", promo: null });
    expect(a).toBe(b);
    expect(a).toBe("Ax2,Bx1|standard|");
  });

  it("reflects the delivery method", () => {
    expect(bagKey({ lines: [{ sku: "A", qty: 1 }], deliveryMethod: "express", promo: null })).toBe("Ax1|express|");
  });

  it("includes the promo CODE but not its percent", () => {
    const base = { lines: [{ sku: "A", qty: 1 }], deliveryMethod: "standard" as const };
    const ten = bagKey({ ...base, promo: { code: "SAVE", percent: 10 } });
    const ninety = bagKey({ ...base, promo: { code: "SAVE", percent: 90 } });
    expect(ten).toBe(ninety);
    expect(ten).toBe("Ax1|standard|SAVE");
  });
});
