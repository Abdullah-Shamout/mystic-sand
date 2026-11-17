import { categories as baseCategories, type Category } from "@/data/categories";
import { products as baseProducts } from "@/data/products";
import type { CategorySlug, Localized, Notes, Product, Variant } from "@/data/types";

// Pure catalog layer (no React, no zustand, safe on the server and the client). It indexes the
// catalog (base data, or the DB rows the storefront reads) into ready-to-read lookups, and provides
// the field validators that sanitise an admin edit before it is written to a row (so a broken edit
// can never corrupt the catalog). The old base-vs-patch machinery is gone: each product is one DB
// row now (Phase 3c), edited in place via the Server Actions in src/server/actions/catalog.ts.

export const CATEGORY_SLUGS = ["perfumes", "oud", "body", "home"] as const;

export type Catalog = {
  /** Catalog order (DB `sort`): base products, then custom products. Includes hidden products. */
  products: Product[];
  /** Products that are not hidden, in the same order. */
  visible: Product[];
  bySlug: ReadonlyMap<string, Product>;
  bySku: ReadonlyMap<string, { product: Product; variant: Variant }>;
  categories: Category[];
};

// --- validation helpers ---------------------------------------------------------------
// These are the injection boundary for an admin edit: the Server Actions run a candidate product
// through normalizeAdded (and the field cleaners) before writing a row, so a bad value is repaired
// or rejected rather than persisted.

const isString = (v: unknown): v is string => typeof v === "string";
const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isCategory = (v: unknown): v is CategorySlug =>
  typeof v === "string" && (CATEGORY_SLUGS as readonly string[]).includes(v);

export const isLocalized = (v: unknown): v is Localized =>
  !!v && typeof v === "object" && isString((v as Localized).en) && isString((v as Localized).ar);

/** A Localized value whose en AND ar are non-blank — for fields shown as a label/heading (category
 * name/description, a product's type/description) where an empty string would render as a blank. */
export const isNonEmptyLocalized = (v: unknown): v is Localized =>
  isLocalized(v) && v.en.trim().length > 0 && v.ar.trim().length > 0;

const isLocalizedList = (v: unknown): v is Localized[] => Array.isArray(v) && v.every(isLocalized);

const isNotes = (v: unknown): v is Notes =>
  !!v &&
  typeof v === "object" &&
  isLocalizedList((v as Notes).top) &&
  isLocalizedList((v as Notes).heart) &&
  isLocalizedList((v as Notes).base);

const isVariant = (v: unknown): v is Variant => {
  if (!v || typeof v !== "object") return false;
  const variant = v as Variant;
  return (
    isNonEmptyString(variant.sku) &&
    typeof variant.priceFils === "number" &&
    Number.isInteger(variant.priceFils) &&
    variant.priceFils >= 0 &&
    typeof variant.stock === "number" &&
    Number.isInteger(variant.stock) &&
    variant.stock >= 0 &&
    isLocalized(variant.size)
  );
};

export const isVariants = (v: unknown): v is Variant[] =>
  Array.isArray(v) && v.length >= 1 && v.every(isVariant);

type Images = Product["images"];

/** Images with a string card, an optional hover and a gallery that is never empty. */
const cleanImages = (v: unknown): Images | null => {
  if (!v || typeof v !== "object") return null;
  const img = v as Images;
  if (!isNonEmptyString(img.card)) return null;
  const gallery = Array.isArray(img.gallery) ? img.gallery.filter(isNonEmptyString) : [];
  return {
    card: img.card,
    ...(isNonEmptyString(img.hover) ? { hover: img.hover } : {}),
    gallery: gallery.length > 0 ? gallery : [img.card],
  };
};

const cleanStringList = (v: unknown): string[] | null =>
  Array.isArray(v) ? v.filter(isNonEmptyString) : null;

/** alsoIn kept to valid slugs that are not the product's own (final) category. */
export const cleanAlsoIn = (v: unknown, category: CategorySlug): CategorySlug[] => {
  if (!Array.isArray(v)) return [];
  const seen = new Set<CategorySlug>();
  for (const slug of v) if (isCategory(slug) && slug !== category) seen.add(slug);
  return [...seen];
};

// --- sanitising -----------------------------------------------------------------------

/** Turns an admin-submitted product into a safe Product, or null when it is unusable. */
export function normalizeAdded(input: Product): Product | null {
  if (!input || typeof input !== "object") return null;
  if (!isNonEmptyString(input.slug) || !isNonEmptyString(input.name)) return null;
  if (!isCategory(input.category)) return null;
  if (!isVariants(input.variants)) return null;
  const images = cleanImages(input.images);
  if (!images) return null;
  // type + description are required (the editor enforces non-empty); tagline + howTo are optional in
  // the editor, so they stay at isLocalized (present, may be blank) — requiring them non-empty would
  // reject editor-valid products.
  if (!isNonEmptyLocalized(input.type) || !isLocalized(input.tagline)) return null;
  if (!isNonEmptyLocalized(input.description) || !isLocalized(input.howTo)) return null;

  return {
    slug: input.slug,
    name: input.name,
    category: input.category,
    alsoIn: cleanAlsoIn(input.alsoIn, input.category),
    type: input.type,
    ...(isLocalized(input.family) ? { family: input.family } : {}),
    tagline: input.tagline,
    description: input.description,
    ...(isNotes(input.notes) ? { notes: input.notes } : {}),
    howTo: input.howTo,
    variants: input.variants,
    images,
    ...(input.badge === "new" ? { badge: "new" as const } : {}),
    related: cleanStringList(input.related) ?? [],
    aliases: cleanStringList(input.aliases) ?? [],
    ...(typeof input.hidden === "boolean" ? { hidden: input.hidden } : {}),
    todo: [],
  };
}

// --- indexing -------------------------------------------------------------------------

/**
 * Builds the bySlug/bySku lookups and the visible list over a ready product + category list. Shared
 * by the base catalog (below) and the server read layer (DB rows → src/server/read/catalog.ts →
 * LiveProvider), so both yield an identical Catalog.
 */
export function indexCatalog(products: Product[], categories: Category[]): Catalog {
  const bySlug = new Map<string, Product>();
  const bySku = new Map<string, { product: Product; variant: Variant }>();
  for (const product of products) {
    if (!bySlug.has(product.slug)) bySlug.set(product.slug, product);
    for (const variant of product.variants) {
      if (!bySku.has(variant.sku)) bySku.set(variant.sku, { product, variant });
    }
  }

  return {
    products,
    visible: products.filter((p) => !p.hidden),
    bySlug,
    bySku,
    categories,
  };
}

/** The seed catalog from src/data — the default LiveContext and the Reset-to-original source. */
export const baseCatalog = indexCatalog(baseProducts, baseCategories);

/** Visible products whose main category is `cat` or whose alsoIn includes it, in catalog order. */
export const productsIn = (catalog: Catalog, cat: CategorySlug): Product[] =>
  catalog.visible.filter((p) => p.category === cat || (p.alsoIn?.includes(cat) ?? false));

/** The product + variant for a SKU, unless the product is hidden or unknown. */
export function visibleBySku(
  catalog: Catalog,
  sku: string,
): { product: Product; variant: Variant } | undefined {
  const hit = catalog.bySku.get(sku);
  if (!hit || hit.product.hidden) return undefined;
  return hit;
}

export const isCustomSlug = (slug: string): boolean => slug.startsWith("c-");

/** Base products use a static path; admin-added (custom) products use a query-string page. */
export const productHref = (slug: string): string =>
  isCustomSlug(slug) ? `/product?p=${encodeURIComponent(slug)}` : `/product/${slug}`;

// --- "edited" detection (admin) -------------------------------------------------------

/** Canonical JSON: sorts object keys recursively, so jsonb key-reordering never reads as a change. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonical((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}
const canon = (v: unknown): string => JSON.stringify(canonical(v)) ?? "null";

/** Editable fields the admin editor writes — the fields that distinguish an edit from the seed. */
const COMPARE_FIELDS = [
  "name",
  "category",
  "alsoIn",
  "type",
  "family",
  "tagline",
  "description",
  "howTo",
  "notes",
  "variants",
  "images",
  "badge",
  "aliases",
  "related",
  "hidden",
] as const;

/**
 * Whether a (DB-read) product differs from its src/data seed — drives the admin "Edited" badge and
 * the Reset affordance. Compares only the editable fields, key-order-insensitively (Postgres jsonb
 * reorders object keys on read), treating alsoIn undefined/[] and hidden undefined/false as equal.
 * Custom (c-…) products have no seed, so they are never "edited" by this measure.
 *
 * `variants.stock` is EXCLUDED from the comparison: stock is live inventory that settleOrder decrements
 * on every sale (Phase 5b), so a product that merely sold a unit must not light up as "Edited".
 */
export function isProductEdited(product: Product): boolean {
  const base = baseCatalog.bySlug.get(product.slug);
  if (!base) return false;
  const norm = (p: Product, field: (typeof COMPARE_FIELDS)[number]): unknown => {
    if (field === "alsoIn") return (p.alsoIn ?? []).filter((c) => c !== p.category);
    if (field === "hidden") return p.hidden ?? false;
    if (field === "variants") return p.variants.map((v) => ({ sku: v.sku, size: v.size, priceFils: v.priceFils }));
    return p[field];
  };
  return COMPARE_FIELDS.some((field) => canon(norm(base, field)) !== canon(norm(product, field)));
}
