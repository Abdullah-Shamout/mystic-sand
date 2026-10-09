import { categories as baseCategories, type Category } from "@/data/categories";
import { products as baseProducts } from "@/data/products";
import type { CategorySlug, Localized, Notes, Product, Variant } from "@/data/types";

// Pure catalog layer (no React, no zustand, safe on the server and the client). It turns
// the base data plus a set of admin edits into a ready-to-read catalog, repairing bad data
// so a broken edit can never take the store down.

export const CATEGORY_SLUGS = ["perfumes", "oud", "body", "home"] as const;

/** A whole-field replacement of the editable product fields. */
export type ProductPatch = Partial<
  Pick<
    Product,
    | "name"
    | "category"
    | "alsoIn"
    | "type"
    | "family"
    | "tagline"
    | "description"
    | "howTo"
    | "notes"
    | "variants"
    | "images"
    | "badge"
    | "aliases"
    | "related"
    | "hidden"
  >
>;

export type CategoryPatch = Partial<Pick<Category, "name" | "description">>;

export type CatalogEdits = {
  patches: Record<string, ProductPatch>;
  added: Product[];
  categories: Partial<Record<CategorySlug, CategoryPatch>>;
};

export const EMPTY_EDITS: CatalogEdits = { patches: {}, added: [], categories: {} };

export type Catalog = {
  /** Base order, then added products in creation order. Includes hidden products. */
  products: Product[];
  /** Products that are not hidden, in the same order. */
  visible: Product[];
  bySlug: ReadonlyMap<string, Product>;
  bySku: ReadonlyMap<string, { product: Product; variant: Variant }>;
  /** Base categories with any name/description patches applied. */
  categories: Category[];
  /** Base-product slugs that carry a patch. */
  edited: ReadonlySet<string>;
};

// --- validation helpers ---------------------------------------------------------------

const isString = (v: unknown): v is string => typeof v === "string";
const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isCategory = (v: unknown): v is CategorySlug =>
  typeof v === "string" && (CATEGORY_SLUGS as readonly string[]).includes(v);

const isLocalized = (v: unknown): v is Localized =>
  !!v && typeof v === "object" && isString((v as Localized).en) && isString((v as Localized).ar);

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

const isVariants = (v: unknown): v is Variant[] => Array.isArray(v) && v.length >= 1 && v.every(isVariant);

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
const cleanAlsoIn = (v: unknown, category: CategorySlug): CategorySlug[] => {
  if (!Array.isArray(v)) return [];
  const seen = new Set<CategorySlug>();
  for (const slug of v) if (isCategory(slug) && slug !== category) seen.add(slug);
  return [...seen];
};

// --- building -------------------------------------------------------------------------

/** Applies a patch to a base product, falling back to the base field whenever a value is bad. */
function applyPatch(base: Product, patch: ProductPatch): Product {
  const next: Product = { ...base };

  if (isNonEmptyString(patch.name)) next.name = patch.name;
  if (isCategory(patch.category)) next.category = patch.category;
  if (isLocalized(patch.type)) next.type = patch.type;
  if ("family" in patch) next.family = isLocalized(patch.family) ? patch.family : base.family;
  if (isLocalized(patch.tagline)) next.tagline = patch.tagline;
  if (isLocalized(patch.description)) next.description = patch.description;
  if (isLocalized(patch.howTo)) next.howTo = patch.howTo;
  if ("notes" in patch) next.notes = isNotes(patch.notes) ? patch.notes : base.notes;
  if (isVariants(patch.variants)) next.variants = patch.variants;

  if ("images" in patch) {
    const images = cleanImages(patch.images);
    if (images) next.images = images;
  }

  if ("badge" in patch) next.badge = patch.badge === "new" ? "new" : undefined;
  if ("aliases" in patch) {
    const aliases = cleanStringList(patch.aliases);
    if (aliases) next.aliases = aliases;
  }
  if ("related" in patch) {
    const related = cleanStringList(patch.related);
    if (related) next.related = related;
  }
  if (typeof patch.hidden === "boolean") next.hidden = patch.hidden;

  if ("alsoIn" in patch) next.alsoIn = cleanAlsoIn(patch.alsoIn, next.category);
  else if (base.alsoIn) next.alsoIn = base.alsoIn.filter((c) => c !== next.category);

  return next;
}

/** Turns a stored "added" product into a safe Product, or null when it is unusable. */
function normalizeAdded(input: Product): Product | null {
  if (!input || typeof input !== "object") return null;
  if (!isNonEmptyString(input.slug) || !isNonEmptyString(input.name)) return null;
  if (!isCategory(input.category)) return null;
  if (!isVariants(input.variants)) return null;
  const images = cleanImages(input.images);
  if (!images) return null;
  if (!isLocalized(input.type) || !isLocalized(input.tagline)) return null;
  if (!isLocalized(input.description) || !isLocalized(input.howTo)) return null;

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

export function buildCatalog(edits: CatalogEdits): Catalog {
  const patches = edits.patches ?? {};
  const edited = new Set<string>();

  const products: Product[] = baseProducts.map((base) => {
    const patch = patches[base.slug];
    if (patch && typeof patch === "object" && Object.keys(patch).length > 0) {
      edited.add(base.slug);
      return applyPatch(base, patch);
    }
    return base;
  });

  for (const added of edits.added ?? []) {
    const product = normalizeAdded(added);
    if (product) products.push(product);
  }

  const bySlug = new Map<string, Product>();
  const bySku = new Map<string, { product: Product; variant: Variant }>();
  for (const product of products) {
    if (!bySlug.has(product.slug)) bySlug.set(product.slug, product);
    for (const variant of product.variants) {
      if (!bySku.has(variant.sku)) bySku.set(variant.sku, { product, variant });
    }
  }

  const catPatches = edits.categories ?? {};
  const categories: Category[] = baseCategories.map((c) => {
    const patch = catPatches[c.slug];
    if (!patch) return c;
    return {
      ...c,
      name: isLocalized(patch.name) ? patch.name : c.name,
      description: isLocalized(patch.description) ? patch.description : c.description,
    };
  });

  return {
    products,
    visible: products.filter((p) => !p.hidden),
    bySlug,
    bySku,
    categories,
    edited,
  };
}

export const baseCatalog = buildCatalog(EMPTY_EDITS);

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

const PATCH_FIELDS = [
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

/** The minimal patch that turns `base` into `edited` — only the fields whose JSON differs. */
export function patchFor(base: Product, edited: Product): ProductPatch {
  const patch: ProductPatch = {};
  for (const field of PATCH_FIELDS) {
    if (JSON.stringify(base[field]) !== JSON.stringify(edited[field])) {
      // Field keys line up with ProductPatch; the cast keeps the loop generic.
      (patch as Record<string, unknown>)[field] = edited[field];
    }
  }
  return patch;
}
