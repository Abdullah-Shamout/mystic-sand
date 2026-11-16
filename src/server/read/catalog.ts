import "server-only";

import { asc } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import type { Category } from "@/data/categories";
import type { Product, Variant } from "@/data/types";
import { getDb, schema } from "@/server/db";

import { STOREFRONT_REVALIDATE } from "./revalidate";

// Server read layer for the storefront catalog. Returns PLAIN, serializable data (arrays/objects,
// no Maps) so it can cross the server→client boundary to <LiveProvider>, which rebuilds the
// Catalog via indexCatalog(). The shapes mirror buildCatalog(EMPTY) exactly: a product with no
// alsoIn/collection/family/notes/badge and not hidden omits those keys, just like src/data.

export type CatalogData = { products: Product[]; categories: Category[] };

type ProductRow = typeof schema.products.$inferSelect;
type VariantRow = typeof schema.variants.$inferSelect;
type CategoryRow = typeof schema.categories.$inferSelect;

/** A variant row → the storefront Variant shape (drops id/productId/sort). */
function toVariant(row: VariantRow): Variant {
  return { sku: row.sku, size: row.size, priceFils: row.priceFils, stock: row.stock };
}

/** A product row + its (sorted) variants → a Product, omitting empty/null optionals. */
function toProduct(row: ProductRow, variants: Variant[]): Product {
  const product: Product = {
    slug: row.slug,
    name: row.name,
    category: row.category,
    type: row.type,
    tagline: row.tagline,
    description: row.description,
    howTo: row.howTo,
    variants,
    images: row.images,
    related: row.related,
    aliases: row.aliases,
    todo: row.todo,
  };
  if (row.alsoIn && row.alsoIn.length > 0) product.alsoIn = row.alsoIn;
  if (row.collection) product.collection = row.collection;
  if (row.family) product.family = row.family;
  if (row.notes) product.notes = row.notes;
  if (row.badge) product.badge = row.badge;
  if (row.hidden) product.hidden = true;
  return product;
}

function toCategory(row: CategoryRow): Category {
  return { slug: row.slug, name: row.name, description: row.description, banner: row.banner };
}

async function readCatalog(): Promise<CatalogData> {
  const db = getDb();
  const [productRows, variantRows, categoryRows] = await Promise.all([
    db.select().from(schema.products).orderBy(asc(schema.products.sort)),
    db.select().from(schema.variants).orderBy(asc(schema.variants.sort)),
    db.select().from(schema.categories).orderBy(asc(schema.categories.sort)),
  ]);

  const variantsByProduct = new Map<string, Variant[]>();
  for (const v of variantRows) {
    const list = variantsByProduct.get(v.productId);
    if (list) list.push(toVariant(v));
    else variantsByProduct.set(v.productId, [toVariant(v)]);
  }

  const products = productRows.map((row) => toProduct(row, variantsByProduct.get(row.id) ?? []));
  const categories = categoryRows.map(toCategory);
  return { products, categories };
}

/**
 * The storefront catalog, read from Postgres and tag-cached under "catalog" for the later
 * updateTag("catalog") write path (Phase 3c admin writes — immediate expiry, like settings/home).
 * Until then STOREFRONT_REVALIDATE is the only refresh. The locale layout marks its render dynamic
 * via connection() so this never runs during the DB-free production build; the first real request
 * reads the live DB.
 */
export const getCatalogData = unstable_cache(readCatalog, ["catalog-data"], {
  tags: ["catalog"],
  revalidate: STOREFRONT_REVALIDATE,
});
