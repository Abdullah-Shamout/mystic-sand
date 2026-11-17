"use server";

import { and, eq, inArray, like, max, notInArray } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";

import { categories as baseCategories, type Category } from "@/data/categories";
import { products as baseProducts } from "@/data/products";
import type { CategorySlug, Product, Variant } from "@/data/types";
import { cleanAlsoIn, isCustomSlug, isNonEmptyLocalized, normalizeAdded } from "@/lib/catalog";
import { requireAdmin } from "@/server/auth/require-admin";
import { getDb, schema, type Db } from "@/server/db";

// The admin WRITE path for the catalog (products, variants, categories). Each product is ONE row
// now (Phase 3c): an edit UPDATEs the row, there is no base-vs-patch diff. Every export is a public
// endpoint, so each one calls requireAdmin() first, sanitises its input through the pure validators
// in @/lib/catalog (so a bad edit can't corrupt a row), writes with parameterised Drizzle queries,
// and calls updateTag("catalog") AFTER the write commits — immediate, read-your-own-writes expiry of
// the storefront's tag-cached catalog read (NOT revalidateTag, which is stale-while-revalidate).
//
// Multi-row writes (a product and its variants) run in db.transaction(...) so a reader never sees a
// product with half its variants.
//
// NOTE: the SINGLETON read-modify-write actions (settings, home_overrides) are serialised against
// concurrent admins by a transaction-scoped pg_advisory_xact_lock (Phase 10, src/server/db/locks.ts).
// The catalog writes here deliberately take NO such lock: they are per-row upserts, not a shared
// singleton, so one admin's write can't silently wipe another's merge. The only read-then-write is
// createProduct's `max(sort)+1`, where a duplicate sort is a harmless ordering tie; resetAllCatalog is
// a blind write-all of the seed (it computes nothing from current shared state). The transactions here
// are for multi-ROW consistency only (a product and its variants).

const CATEGORY_SLUGS = ["perfumes", "oud", "body", "home"] as const;
const categorySchema = z.enum(CATEGORY_SLUGS);
const slugSchema = z.string().min(1);

/** The Drizzle transaction handle (same query builder surface as the Db). */
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// --- row builders ---------------------------------------------------------------------

/**
 * The editable product columns from a sanitised Product — everything the editor writes. Excludes
 * slug (the identity), sort, collection and todo: on an UPDATE those are preserved from the row (the
 * editor wipes todo to [] and never edits collection, and the old patch model kept both), and on a
 * fresh INSERT they are set explicitly by the caller.
 */
function editableProductColumns(safe: Product) {
  return {
    name: safe.name,
    category: safe.category,
    alsoIn: safe.alsoIn ?? [],
    type: safe.type,
    family: safe.family ?? null,
    tagline: safe.tagline,
    description: safe.description,
    howTo: safe.howTo,
    notes: safe.notes ?? null,
    images: safe.images,
    badge: safe.badge ?? null,
    related: safe.related,
    aliases: safe.aliases,
    hidden: safe.hidden ?? false,
  };
}

/** Every product column from a src/data seed product (used to overwrite a row on reset). */
function seedProductColumns(p: Product, index: number) {
  return {
    slug: p.slug,
    name: p.name,
    category: p.category,
    alsoIn: p.alsoIn ?? [],
    collection: p.collection ?? null,
    type: p.type,
    family: p.family ?? null,
    tagline: p.tagline,
    description: p.description,
    howTo: p.howTo,
    notes: p.notes ?? null,
    images: p.images,
    badge: p.badge ?? null,
    related: p.related,
    aliases: p.aliases,
    hidden: p.hidden ?? false,
    todo: p.todo ?? [],
    sort: index,
  };
}

/**
 * Reconciles a product's variant rows to exactly `vs`: upsert each incoming variant by sku (the
 * sku's owner moves to `productId`, so callers that take untrusted input must guard ownership
 * first), preserving order in `sort`, then delete this product's variant rows whose sku isn't
 * incoming. Respects the CHECK(stock >= 0) / CHECK(price_fils >= 0) constraints via the validators.
 *
 * STOCK IS NEVER TOUCHED ON UPDATE. `variants.stock` is the live inventory count that settleOrder
 * decrements on a sale; a general product save/reset must not clobber it. So `stock` is set ONLY on
 * the INSERT branch (a brand-new sku has no live count yet) and is EXCLUDED from the
 * onConflictDoUpdate SET for an existing sku — the row's live stock survives the write untouched.
 * The one and only path that changes an existing variant's stock is setVariantStock (the Stock page).
 */
async function writeVariants(tx: Tx, productId: string, vs: Variant[]): Promise<void> {
  const skus = vs.map((v) => v.sku);
  for (let j = 0; j < vs.length; j++) {
    const v = vs[j];
    // INSERT a new sku with its seed/typed stock…
    const insertRow = { productId, sku: v.sku, size: v.size, priceFils: v.priceFils, stock: v.stock, sort: j };
    // …but on conflict (an EXISTING sku) update everything EXCEPT stock, so the live count is preserved.
    const updateSet = { productId, size: v.size, priceFils: v.priceFils, sort: j };
    await tx.insert(schema.variants).values(insertRow).onConflictDoUpdate({ target: schema.variants.sku, set: updateSet });
  }
  if (skus.length > 0) {
    await tx
      .delete(schema.variants)
      .where(and(eq(schema.variants.productId, productId), notInArray(schema.variants.sku, skus)));
  }
}

/** The incoming variant skus a saved product may own: no duplicates, none owned by another product. */
async function assertSkusAssignable(tx: Tx, skus: string[], ownProductId: string | null): Promise<void> {
  if (new Set(skus).size !== skus.length) {
    throw new Error("Each variant must have a distinct SKU.");
  }
  const existing = await tx
    .select({ sku: schema.variants.sku, productId: schema.variants.productId })
    .from(schema.variants)
    .where(inArray(schema.variants.sku, skus));
  for (const row of existing) {
    if (row.productId !== ownProductId) {
      throw new Error(`SKU ${row.sku} already belongs to another product.`);
    }
  }
}

// --- products -------------------------------------------------------------------------

/**
 * Saves an edit to an EXISTING product (base or custom — both are just the row with that slug). The
 * `slug` argument is authoritative (never input.slug). In a transaction: UPDATE the editable columns
 * of the row (collection, todo and sort are preserved), then reconcile its variants. Throws if the
 * slug has no row (a stale UI) rather than minting a row, which could create a non-`c-` custom slug.
 */
export async function saveProduct(slug: string, input: Product): Promise<Product> {
  await requireAdmin();
  const s = slugSchema.parse(slug);
  const safe = normalizeAdded({ ...input, slug: s });
  if (!safe) throw new Error("The product is missing a required field or has an invalid value.");

  await getDb().transaction(async (tx) => {
    const [row] = await tx
      .select({ id: schema.products.id })
      .from(schema.products)
      .where(eq(schema.products.slug, s))
      .limit(1);
    if (!row) throw new Error(`No product with slug "${s}".`);

    await assertSkusAssignable(tx, safe.variants.map((v) => v.sku), row.id);
    await tx
      .update(schema.products)
      .set({ ...editableProductColumns(safe), updatedAt: new Date() })
      .where(eq(schema.products.id, row.id));
    await writeVariants(tx, row.id, safe.variants);
  });

  updateTag("catalog");
  return safe;
}

/**
 * Creates a new CUSTOM product. The slug must be a `c-…` custom slug (isCustomSlug) that is not
 * already present. In a transaction: INSERT the product row (sort after the last product) and its
 * variant rows. Rejects a slug or any sku that already exists.
 */
export async function createProduct(input: Product): Promise<Product> {
  await requireAdmin();
  const safe = normalizeAdded(input);
  if (!safe) throw new Error("The product is missing a required field or has an invalid value.");
  if (!isCustomSlug(safe.slug)) throw new Error("A new product must have a custom (c-…) slug.");

  await getDb().transaction(async (tx) => {
    const [clash] = await tx
      .select({ id: schema.products.id })
      .from(schema.products)
      .where(eq(schema.products.slug, safe.slug))
      .limit(1);
    if (clash) throw new Error(`A product with slug "${safe.slug}" already exists.`);

    const skus = safe.variants.map((v) => v.sku);
    if (new Set(skus).size !== skus.length) throw new Error("Each variant must have a distinct SKU.");
    const taken = await tx
      .select({ sku: schema.variants.sku })
      .from(schema.variants)
      .where(inArray(schema.variants.sku, skus));
    if (taken.length > 0) throw new Error(`SKU ${taken[0].sku} already belongs to another product.`);

    const [{ maxSort }] = await tx.select({ maxSort: max(schema.products.sort) }).from(schema.products);
    const [inserted] = await tx
      .insert(schema.products)
      .values({
        slug: safe.slug,
        ...editableProductColumns(safe),
        collection: null,
        todo: safe.todo ?? [],
        sort: (maxSort ?? -1) + 1,
      })
      .returning({ id: schema.products.id });
    await writeVariants(tx, inserted.id, safe.variants);
  });

  updateTag("catalog");
  return safe;
}

/** Hides or shows a product by slug (hidden products stay in the catalog but off the storefront). */
export async function setHidden(slug: string, hidden: boolean): Promise<void> {
  await requireAdmin();
  const s = slugSchema.parse(slug);
  const h = z.boolean().parse(hidden);
  const updated = await getDb()
    .update(schema.products)
    .set({ hidden: h, updatedAt: new Date() })
    .where(eq(schema.products.slug, s))
    .returning({ id: schema.products.id });
  if (updated.length === 0) throw new Error(`No product with slug "${s}".`);
  updateTag("catalog");
}

/** Sets one variant's stock to an exact, clamped (>= 0, integer) value by sku. */
export async function setVariantStock(sku: string, stock: number): Promise<number> {
  await requireAdmin();
  const k = slugSchema.parse(sku);
  const n = z.number().finite().parse(stock);
  const value = Math.max(0, Math.round(n));
  const updated = await getDb()
    .update(schema.variants)
    .set({ stock: value })
    .where(eq(schema.variants.sku, k))
    .returning({ id: schema.variants.id });
  if (updated.length === 0) throw new Error(`No variant with sku "${k}".`);
  updateTag("catalog");
  return value;
}

/**
 * Moves a product to another main category, keeping any alsoIn tags (cleaned, and never the new main
 * category). When `alsoIn` is given it replaces the tags; otherwise the row's current tags are kept.
 */
export async function setCategory(
  slug: string,
  category: CategorySlug,
  alsoIn?: CategorySlug[],
): Promise<void> {
  await requireAdmin();
  const s = slugSchema.parse(slug);
  const cat = categorySchema.parse(category);
  const [row] = await getDb()
    .select({ alsoIn: schema.products.alsoIn })
    .from(schema.products)
    .where(eq(schema.products.slug, s))
    .limit(1);
  if (!row) throw new Error(`No product with slug "${s}".`);
  const nextAlsoIn = cleanAlsoIn(alsoIn ?? row.alsoIn, cat);
  await getDb()
    .update(schema.products)
    .set({ category: cat, alsoIn: nextAlsoIn, updatedAt: new Date() })
    .where(eq(schema.products.slug, s));
  updateTag("catalog");
}

/**
 * Restores a BASE product (and its variants) to the src/data seed. A custom slug is a no-op (customs
 * have no seed); an unknown base slug is a no-op. Replaces the old "drop patch → restore base".
 *
 * Live `variants.stock` is PRESERVED (writeVariants never updates stock for an existing sku): a reset
 * restores copy/price/size but not the inventory count, which is owned by the Stock page.
 */
export async function resetProduct(slug: string): Promise<void> {
  await requireAdmin();
  const s = slugSchema.parse(slug);
  if (isCustomSlug(s)) return;
  const index = baseProducts.findIndex((p) => p.slug === s);
  if (index < 0) return;
  const base = baseProducts[index];

  await getDb().transaction(async (tx) => {
    await tx
      .update(schema.products)
      .set({ ...seedProductColumns(base, index), updatedAt: new Date() })
      .where(eq(schema.products.slug, s));
    const [row] = await tx
      .select({ id: schema.products.id })
      .from(schema.products)
      .where(eq(schema.products.slug, s))
      .limit(1);
    if (!row) return;
    await writeVariants(tx, row.id, base.variants);
  });

  updateTag("catalog");
}

/** Deletes a CUSTOM product (and its variants, via the FK cascade). Base products are hidden, never deleted. */
export async function deleteProduct(slug: string): Promise<void> {
  await requireAdmin();
  const s = slugSchema.parse(slug);
  if (!isCustomSlug(s)) return;
  await getDb().delete(schema.products).where(eq(schema.products.slug, s));
  updateTag("catalog");
}

// --- categories -----------------------------------------------------------------------

export type CategoryPatch = { name?: unknown; description?: unknown };

/**
 * Updates a category's localized name/description (the 4 built-in collections). A field that isn't a
 * valid Localized value falls back to the current row value, so a reset = saving the seed values and
 * a partial patch keeps the untouched field. The banner is not edited here, so it is left untouched.
 */
export async function saveCategory(slug: CategorySlug, patch: CategoryPatch): Promise<Category> {
  await requireAdmin();
  const s = categorySchema.parse(slug);
  const [row] = await getDb()
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.slug, s))
    .limit(1);
  if (!row) throw new Error(`No category with slug "${s}".`);

  // A blank name/description would render as an empty menu item / heading, so fall back to the current
  // row value unless the patch field is a non-blank Localized value.
  const name = isNonEmptyLocalized(patch?.name) ? patch.name : row.name;
  const description = isNonEmptyLocalized(patch?.description) ? patch.description : row.description;
  await getDb().update(schema.categories).set({ name, description }).where(eq(schema.categories.slug, s));
  updateTag("catalog");
  return { slug: s, name, description, banner: row.banner };
}

// --- reset everything -----------------------------------------------------------------

/**
 * Restores the whole catalog to the src/data seed: re-seed all base categories, products and
 * variants, and delete every custom (`c-…`) product. Runs in one transaction (mirrors scripts/seed.ts,
 * which can't be imported — it runs main()/pool.end() at import time).
 *
 * Live `variants.stock` is PRESERVED for every existing sku (writeVariants only sets stock on INSERT),
 * so a catalog reset never rewinds inventory the way the standalone db:seed script deliberately does.
 */
export async function resetAllCatalog(): Promise<void> {
  await requireAdmin();

  await getDb().transaction(async (tx) => {
    for (let i = 0; i < baseCategories.length; i++) {
      const c = baseCategories[i];
      const row = { slug: c.slug, name: c.name, description: c.description, banner: c.banner, sort: i };
      await tx.insert(schema.categories).values(row).onConflictDoUpdate({ target: schema.categories.slug, set: row });
    }

    // Remove custom products (their variants cascade) before re-seeding the base rows.
    await tx.delete(schema.products).where(like(schema.products.slug, "c-%"));

    for (let i = 0; i < baseProducts.length; i++) {
      const row = seedProductColumns(baseProducts[i], i);
      const [upserted] = await tx
        .insert(schema.products)
        .values(row)
        .onConflictDoUpdate({ target: schema.products.slug, set: { ...row, updatedAt: new Date() } })
        .returning({ id: schema.products.id });
      await writeVariants(tx, upserted.id, baseProducts[i].variants);
    }
  });

  updateTag("catalog");
}
