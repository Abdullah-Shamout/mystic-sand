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

// --- validation + sanitising helpers --------------------------------------------------
// These are the injection boundary for an admin edit: the Server Actions run a candidate product
// through normalizeAdded (and the field cleaners) before writing a row, so a bad value is repaired or
// rejected rather than persisted. Every jsonb field is cleaned FIELD BY FIELD — extra keys INSIDE a
// Localized / Notes / Images value are stripped (a plain `isLocalized` copies them as-is), and every
// string/array is length/count bounded (A03) — so an authenticated but malformed or oversized payload
// can never bloat a row.

const isString = (v: unknown): v is string => typeof v === "string";
const isCategory = (v: unknown): v is CategorySlug =>
  typeof v === "string" && (CATEGORY_SLUGS as readonly string[]).includes(v);

export const isLocalized = (v: unknown): v is Localized =>
  !!v && typeof v === "object" && isString((v as Localized).en) && isString((v as Localized).ar);

/** A Localized value whose en AND ar are non-blank — for fields shown as a label/heading (category
 * name/description, a product's type/description) where an empty string would render as a blank. */
export const isNonEmptyLocalized = (v: unknown): v is Localized =>
  isLocalized(v) && v.en.trim().length > 0 && v.ar.trim().length > 0;

/**
 * Per-field input bounds. Each cap sits COMFORTABLY ABOVE the longest value in the src/data seed, so a
 * seed / reset / legit edit is never rejected, while an oversized authenticated payload still is.
 * Seed maxima (chars / count): name 17, type 26, tagline 47, description 162, howTo 118, family 16,
 * note item 20, notes per list 3, image key 24, gallery 5, related 4×(≤9), aliases 9×(≤8), variants 2,
 * sku 14, size 19.
 */
export const CATALOG_LIMITS = {
  slug: 80,
  name: 80,
  type: 60,
  tagline: 120,
  description: 400,
  howTo: 400,
  family: 60,
  noteItem: 60,
  notesPerList: 12,
  imageKey: 120,
  gallery: 20,
  relatedItem: 80,
  related: 24,
  aliasItem: 80,
  aliases: 24,
  variants: 12,
  sku: 64,
  size: 60,
} as const;

// A lone/unpaired UTF-16 surrogate throws "URI malformed" in encodeURIComponent, so a value that is
// not well-formed is rejected. Duplicated from src/lib/home.ts's cleaner, to keep this module self-
// contained (the brief sanctioned duplicating rather than a shared extraction).
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const isWellFormed = (value: string): boolean =>
  typeof (value as { isWellFormed?: () => boolean }).isWellFormed === "function"
    ? (value as unknown as { isWellFormed: () => boolean }).isWellFormed()
    : !LONE_SURROGATE.test(value);

/**
 * Extracts ONLY { en, ar } (dropping any extra keys), trims each, and requires both to be well-formed
 * and within `limit`; returns null otherwise. `allowBlank` keeps the "present-but-maybe-blank" rule of
 * the optional copy fields (tagline / howTo / family): both languages must still be PRESENT as strings,
 * but either may be empty. An over-limit or malformed language rejects the whole value (null).
 */
export function cleanLocalized(raw: unknown, limit: number, allowBlank = false): Localized | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out = { en: "", ar: "" };
  for (const lang of ["en", "ar"] as const) {
    const value = r[lang];
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (trimmed.length > limit || !isWellFormed(trimmed)) return null;
    if (!allowBlank && trimmed.length < 1) return null;
    out[lang] = trimmed;
  }
  return { en: out.en, ar: out.ar };
}

/** A single trimmed, non-empty, within-limit, well-formed string, else null. */
function cleanPlainString(raw: unknown, limit: number): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length >= 1 && trimmed.length <= limit && isWellFormed(trimmed) ? trimmed : null;
}

/** Valid strings only, each within `limit`, the list capped to `maxCount` (order preserved). */
function cleanStringListBounded(raw: unknown, limit: number, maxCount: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const value of raw) {
    const s = cleanPlainString(value, limit);
    if (s) out.push(s);
    if (out.length >= maxCount) break;
  }
  return out;
}

type Images = Product["images"];

/** Images with a string card, an optional hover and a gallery that is never empty — every image-key
 * string length-capped and the gallery count-capped. */
function cleanImages(raw: unknown): Images | null {
  if (!raw || typeof raw !== "object") return null;
  const img = raw as Record<string, unknown>;
  const card = cleanPlainString(img.card, CATALOG_LIMITS.imageKey);
  if (!card) return null;
  const hover = cleanPlainString(img.hover, CATALOG_LIMITS.imageKey);
  const gallery = cleanStringListBounded(img.gallery, CATALOG_LIMITS.imageKey, CATALOG_LIMITS.gallery);
  return {
    card,
    ...(hover ? { hover } : {}),
    gallery: gallery.length > 0 ? gallery : [card],
  };
}

/** Variants capped to CATALOG_LIMITS.variants, each rebuilt to exactly { sku, size, priceFils, stock }
 * (extra keys stripped; sku length-capped, size key-stripped + length-capped). Null if any is invalid. */
function cleanVariants(raw: unknown): Variant[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Variant[] = [];
  for (const value of raw.slice(0, CATALOG_LIMITS.variants)) {
    if (!value || typeof value !== "object") return null;
    const v = value as Record<string, unknown>;
    const sku = cleanPlainString(v.sku, CATALOG_LIMITS.sku);
    const size = cleanLocalized(v.size, CATALOG_LIMITS.size);
    if (!sku || !size) return null;
    if (typeof v.priceFils !== "number" || !Number.isInteger(v.priceFils) || v.priceFils < 0) return null;
    if (typeof v.stock !== "number" || !Number.isInteger(v.stock) || v.stock < 0) return null;
    out.push({ sku, size, priceFils: v.priceFils, stock: v.stock });
  }
  return out.length >= 1 ? out : null;
}

/** Notes: each of top / heart / base capped to CATALOG_LIMITS.notesPerList and every item key-stripped
 * + length-capped via cleanLocalized. Null (→ notes omitted) if the shape is wrong or an item invalid. */
function cleanNotes(raw: unknown): Notes | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const result = {} as Notes;
  for (const group of ["top", "heart", "base"] as const) {
    const list = r[group];
    if (!Array.isArray(list)) return null;
    const items: Localized[] = [];
    for (const item of list.slice(0, CATALOG_LIMITS.notesPerList)) {
      const clean = cleanLocalized(item, CATALOG_LIMITS.noteItem);
      if (!clean) return null;
      items.push(clean);
    }
    result[group] = items;
  }
  return result;
}

/** alsoIn kept to valid slugs that are not the product's own (final) category. */
export const cleanAlsoIn = (v: unknown, category: CategorySlug): CategorySlug[] => {
  if (!Array.isArray(v)) return [];
  const seen = new Set<CategorySlug>();
  for (const slug of v) if (isCategory(slug) && slug !== category) seen.add(slug);
  return [...seen];
};

/**
 * Turns an admin-submitted product into a safe, FULLY-BOUNDED Product, or null when it is unusable.
 * Every field is cleaned field-by-field, so the written jsonb carries only known keys within their
 * caps — which also keeps isProductEdited's seed comparison accurate (the cleaned shape matches the
 * seed's). type + description are required non-blank; tagline + howTo are present-but-maybe-blank
 * (optional in the editor); family + notes are omitted when absent.
 */
export function normalizeAdded(input: Product): Product | null {
  if (!input || typeof input !== "object") return null;
  const slug = cleanPlainString(input.slug, CATALOG_LIMITS.slug);
  const name = cleanPlainString(input.name, CATALOG_LIMITS.name);
  if (!slug || !name || !isCategory(input.category)) return null;

  const type = cleanLocalized(input.type, CATALOG_LIMITS.type);
  const description = cleanLocalized(input.description, CATALOG_LIMITS.description);
  const tagline = cleanLocalized(input.tagline, CATALOG_LIMITS.tagline, true);
  const howTo = cleanLocalized(input.howTo, CATALOG_LIMITS.howTo, true);
  if (!type || !description || !tagline || !howTo) return null;

  const variants = cleanVariants(input.variants);
  if (!variants) return null;
  const images = cleanImages(input.images);
  if (!images) return null;

  const family = cleanLocalized(input.family, CATALOG_LIMITS.family, true); // optional → omit if null
  const notes = cleanNotes(input.notes); // optional → omit if null

  return {
    slug,
    name,
    category: input.category,
    alsoIn: cleanAlsoIn(input.alsoIn, input.category),
    type,
    ...(family ? { family } : {}),
    tagline,
    description,
    ...(notes ? { notes } : {}),
    howTo,
    variants,
    images,
    ...(input.badge === "new" ? { badge: "new" as const } : {}),
    related: cleanStringListBounded(input.related, CATALOG_LIMITS.relatedItem, CATALOG_LIMITS.related),
    aliases: cleanStringListBounded(input.aliases, CATALOG_LIMITS.aliasItem, CATALOG_LIMITS.aliases),
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
