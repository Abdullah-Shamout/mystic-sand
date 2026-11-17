import "server-only";

import { asc } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import type { Category } from "@/data/categories";
import type { Product, Variant } from "@/data/types";
import { requireAdmin } from "@/server/auth/require-admin";
import { getDb, schema } from "@/server/db";

import { CATALOG_REVALIDATE } from "./revalidate";

// Server read layer for the catalog. Returns PLAIN, serializable data (arrays/objects, no Maps) so it
// can cross the server→client boundary to <LiveProvider>, which rebuilds the Catalog via
// indexCatalog(). The shapes mirror the src/data base products exactly.
//
// There are TWO reads, with a DIFFERENT shape (A01):
//  - getCatalogData       — the STOREFRONT read. Hidden products are filtered out server-side (not
//    just at render) and the internal `todo` notes are stripped, so an anonymous RSC payload never
//    carries a hidden product or a `todo` string. Tag-cached under "catalog".
//  - getAdminCatalogData  — the requireAdmin-gated ADMIN read. Returns EVERY product (including
//    hidden) WITH its `todo`, for the admin product list / editor / stock / analysis. Not cached
//    (it is request-scoped and already behind the admin gate).

export type CatalogData = { products: Product[]; categories: Category[] };

type ProductRow = typeof schema.products.$inferSelect;
type VariantRow = typeof schema.variants.$inferSelect;
type CategoryRow = typeof schema.categories.$inferSelect;

/** A variant row → the storefront Variant shape (drops id/productId/sort). */
function toVariant(row: VariantRow): Variant {
  return { sku: row.sku, size: row.size, priceFils: row.priceFils, stock: row.stock };
}

/**
 * A product row + its (sorted) variants → a Product, omitting empty/null optionals. `internal` adds
 * the admin-only `todo` notes; the storefront shape omits them entirely (they never leave the server).
 */
function toProduct(row: ProductRow, variants: Variant[], internal: boolean): Product {
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
  };
  if (row.alsoIn && row.alsoIn.length > 0) product.alsoIn = row.alsoIn;
  if (row.collection) product.collection = row.collection;
  if (row.family) product.family = row.family;
  if (row.notes) product.notes = row.notes;
  if (row.badge) product.badge = row.badge;
  if (row.hidden) product.hidden = true;
  if (internal) product.todo = row.todo;
  return product;
}

function toCategory(row: CategoryRow): Category {
  return { slug: row.slug, name: row.name, description: row.description, banner: row.banner };
}

/**
 * The three catalog reads in ONE read-only REPEATABLE READ transaction so they share a single MVCC
 * snapshot: a createProduct / deleteProduct / resetAllCatalog committing mid-read can't surface a
 * product with its variants already (or not yet) written — which the storefront would deref as
 * variants[0] → 500. This runs at request time (both callers are runtime-dynamic), so the DB-free
 * build is unaffected.
 * The three selects run SEQUENTIALLY (not Promise.all): a transaction holds ONE connection, and
 * node-postgres does not allow concurrent queries on a single client (they race and corrupt the
 * connection). Sequential is fine — a REPEATABLE READ snapshot is fixed at the first query.
 */
async function readCatalogRows(): Promise<{
  productRows: ProductRow[];
  variantRows: VariantRow[];
  categoryRows: CategoryRow[];
}> {
  return getDb().transaction(
    async (tx) => {
      const productRows = await tx.select().from(schema.products).orderBy(asc(schema.products.sort));
      const variantRows = await tx.select().from(schema.variants).orderBy(asc(schema.variants.sort));
      const categoryRows = await tx.select().from(schema.categories).orderBy(asc(schema.categories.sort));
      return { productRows, variantRows, categoryRows };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/** Shapes the shared rows into a CatalogData. `internal` keeps hidden products + `todo` (admin); the
 * storefront call drops both. The zero-variant filter guards against a momentarily torn read. */
function buildCatalog(
  rows: Awaited<ReturnType<typeof readCatalogRows>>,
  internal: boolean,
): CatalogData {
  const { productRows, variantRows, categoryRows } = rows;

  const variantsByProduct = new Map<string, Variant[]>();
  for (const v of variantRows) {
    const list = variantsByProduct.get(v.productId);
    if (list) list.push(toVariant(v));
    else variantsByProduct.set(v.productId, [toVariant(v)]);
  }

  const products = productRows
    .map((row) => toProduct(row, variantsByProduct.get(row.id) ?? [], internal))
    // Belt-and-suspenders: every real product has ≥1 variant, so this never drops a legit product —
    // it just omits a momentarily-torn one instead of crashing the storefront on variants[0].
    .filter((p) => p.variants.length > 0)
    // STOREFRONT ONLY: omit hidden products entirely (A01) — they never reach the anonymous payload.
    .filter((p) => internal || !p.hidden);
  const categories = categoryRows.map(toCategory);
  return { products, categories };
}

async function readStorefrontCatalog(): Promise<CatalogData> {
  return buildCatalog(await readCatalogRows(), false);
}

/**
 * The STOREFRONT catalog (hidden products omitted, `todo` stripped), read from Postgres and tag-cached
 * under "catalog". The admin Server Actions (src/server/actions/catalog.ts) call updateTag("catalog")
 * on every write — immediate, read-your-own-writes expiry; CATALOG_REVALIDATE is only a time-based
 * backstop. The locale layout marks its render dynamic via connection() so this never runs during the
 * DB-free production build; the first real request reads the live DB.
 */
export const getCatalogData = unstable_cache(readStorefrontCatalog, ["catalog-data"], {
  tags: ["catalog"],
  revalidate: CATALOG_REVALIDATE,
});

/**
 * The ADMIN catalog: EVERY product (including hidden) WITH its internal `todo` notes, for the admin
 * product list / editor / stock / analysis. requireAdmin-gated (it exposes hidden products + internal
 * notes) and NOT cached — it is read per admin request (the admin layout refetches on router.refresh
 * after a catalog write). The admin layout is already dynamic (it reads the session cookie), so this
 * never runs during the DB-free build.
 */
export async function getAdminCatalogData(): Promise<CatalogData> {
  await requireAdmin();
  return buildCatalog(await readCatalogRows(), true);
}
