import { describe, expect, it } from "vitest";

import { schema } from "@/server/db";

import { buildCatalog } from "./catalog";

// Unit coverage for buildCatalog's storefront-vs-admin shaping. The focus here is the related[] scoping
// (A01): a VISIBLE product's related[] may name a HIDDEN product's slug, and a slug embeds that
// product's name, so the STOREFRONT build must strip related to slugs that are present and visible,
// while the ADMIN build keeps every slug. buildCatalog is pure (rows → CatalogData), so this needs no
// DB — it is fed hand-built rows.

type ProductRow = typeof schema.products.$inferSelect;
type VariantRow = typeof schema.variants.$inferSelect;
type CategoryRow = typeof schema.categories.$inferSelect;

function makeProduct(over: Partial<ProductRow> & Pick<ProductRow, "id" | "slug">): ProductRow {
  return {
    name: over.slug.toUpperCase(),
    category: "perfumes",
    alsoIn: [],
    collection: null,
    type: { en: "Type", ar: "نوع" },
    family: null,
    tagline: { en: "Tag", ar: "سطر" },
    description: { en: "Desc", ar: "وصف" },
    howTo: { en: "How", ar: "كيف" },
    notes: null,
    images: { card: "renders/i", gallery: ["renders/i"] },
    badge: null,
    related: [],
    aliases: [],
    hidden: false,
    todo: [],
    sort: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  };
}

function makeVariant(productId: string, sku: string): VariantRow {
  return { id: `v-${sku}`, productId, sku, size: { en: "50 ml", ar: "٥٠ مل" }, priceFils: 1000, stock: 5, sort: 0 };
}

describe("buildCatalog related[] scoping", () => {
  // a (visible) relates to b (HIDDEN), c (visible) and "ghost" (absent); c (visible) relates to a.
  const rows = {
    productRows: [
      makeProduct({ id: "id-a", slug: "a", sort: 0, related: ["b", "c", "ghost"] }),
      makeProduct({ id: "id-b", slug: "b", sort: 1, hidden: true, related: [] }),
      makeProduct({ id: "id-c", slug: "c", sort: 2, related: ["a"] }),
    ],
    variantRows: [makeVariant("id-a", "SKU-A"), makeVariant("id-b", "SKU-B"), makeVariant("id-c", "SKU-C")],
    categoryRows: [] as CategoryRow[],
  };

  it("STOREFRONT: strips a hidden (or absent) product's slug from a visible product's related[]", () => {
    const { products } = buildCatalog(rows, false);
    // The hidden product never reaches the anonymous payload at all.
    expect(products.map((p) => p.slug)).toEqual(["a", "c"]);
    // a's related loses b (hidden) and ghost (absent); the visible c survives.
    expect(products[0].related).toEqual(["c"]);
    // c's related keeps a (visible).
    expect(products[1].related).toEqual(["a"]);
  });

  it("ADMIN: keeps every product and every related slug, including a hidden product's", () => {
    const { products } = buildCatalog(rows, true);
    expect(products.map((p) => p.slug)).toEqual(["a", "b", "c"]);
    // a's related is untouched in the admin build (b retained).
    expect(products[0].related).toEqual(["b", "c", "ghost"]);
  });
});
