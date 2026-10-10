import type { CategorySlug, Localized, Product } from "@/data/types";
import type { Locale } from "@/i18n/routing";
import { isCustomSlug, type Catalog } from "@/lib/catalog";
import { normalizeSearch } from "@/lib/search";
import { availableFromStock } from "@/lib/stock";
import type { SoldMap } from "@/store/stock";
import { inDateRange, type RangeFilter, type SourceFilter, type AdminOrder } from "./orders";

// Pure, React-free product analytics. From the paid + confirming orders of both sources and the
// live catalog it rolls up units ordered, orders and revenue per product (joined by line.slug so
// sales survive renames / SKU changes), grouped into the catalog's categories. "Now" is passed in.

export type AnalysisFilters = {
  query: string;
  range: RangeFilter;
  from?: string;
  to?: string;
  source: SourceFilter;
  /** Only count orders that have been marked done (fulfillment). */
  completedOnly: boolean;
};

export const defaultAnalysisFilters: AnalysisFilters = {
  query: "",
  range: "all",
  source: "all",
  completedOnly: false,
};

/** Units and revenue for a single size (one SKU) of a product. */
export type SizeStat = {
  sku: string;
  size: Localized;
  units: number;
  revenueFils: number;
};

/** A product with its sales roll-up and the current catalog facts (price, stock, flags). */
export type ProductStat = {
  slug: string;
  name: string;
  type: Localized;
  image: string;
  category: CategorySlug;
  alsoIn: CategorySlug[];
  priceMinFils: number;
  priceMaxFils: number;
  stock: number;
  hidden: boolean;
  custom: boolean;
  skus: string[];
  units: number;
  orders: number;
  revenueFils: number;
  sizes: SizeStat[];
};

/** A line whose product is no longer in the catalog (name/size from the order snapshot). */
export type RemovedStat = {
  slug: string;
  name: string;
  units: number;
  orders: number;
  revenueFils: number;
  sizes: SizeStat[];
};

export type Totals = { units: number; orders: number; revenueFils: number };

export type CategorySection = Totals & {
  slug: CategorySlug;
  name: Localized;
  products: ProductStat[];
};

export type AnalysisSummary = Totals & {
  bestSeller: { name: string; units: number } | null;
};

export type ProductAnalysis = {
  sections: CategorySection[];
  removed: RemovedStat[];
  /** Every matched product once (deduped across categories), units-first — for the All-products sheet. */
  products: ProductStat[];
  summary: AnalysisSummary;
  /** True when a product/removed row is shown anywhere (drives the overall empty state). */
  hasRows: boolean;
};

type Agg = {
  units: number;
  orders: Set<string>;
  revenueFils: number;
  sizes: Map<string, { size: Localized; units: number; revenueFils: number }>;
};

function emptyAgg(): Agg {
  return { units: 0, orders: new Set(), revenueFils: 0, sizes: new Map() };
}

/** Name, type (EN + AR + current locale) and SKUs, matched with the shared search normaliser. */
function matchesProduct(stat: ProductStat, query: string, locale: Locale): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  const haystack = [stat.name, stat.type.en, stat.type.ar, stat.type[locale], ...stat.skus]
    .map(normalizeSearch)
    .join(" ");
  return haystack.includes(q);
}

function matchesRemoved(stat: RemovedStat, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  return normalizeSearch(`${stat.name} ${stat.slug}`).includes(q);
}

/** Orders counted: paid + confirming, passing the source, date-range and completed-only filters. */
function selectOrders(orders: AdminOrder[], filters: AnalysisFilters, now: Date): AdminOrder[] {
  return orders.filter((item) => {
    if (!item.paid) return false;
    if (filters.source !== "all" && item.source !== filters.source) return false;
    if (filters.completedOnly && item.fulfillment !== "done") return false;
    return inDateRange(item.placedAt, filters.range, filters.from, filters.to, now);
  });
}

function sizesFromAgg(agg: Agg | undefined, product?: Product): SizeStat[] {
  if (!agg) return [];
  const used = new Set<string>();
  const sizes: SizeStat[] = [];
  // Current variants first, in their natural order, with the up-to-date size label…
  for (const variant of product?.variants ?? []) {
    const s = agg.sizes.get(variant.sku);
    if (!s) continue;
    used.add(variant.sku);
    sizes.push({ sku: variant.sku, size: variant.size, units: s.units, revenueFils: s.revenueFils });
  }
  // …then any SKUs that are no longer current (renamed / removed variants), by units.
  const rest: SizeStat[] = [];
  for (const [sku, s] of agg.sizes) {
    if (used.has(sku)) continue;
    rest.push({ sku, size: s.size, units: s.units, revenueFils: s.revenueFils });
  }
  rest.sort((a, b) => b.units - a.units);
  return [...sizes, ...rest];
}

function buildStat(product: Product, agg: Agg | undefined, sold: SoldMap): ProductStat {
  const prices = product.variants.map((v) => v.priceFils);
  return {
    slug: product.slug,
    name: product.name,
    type: product.type,
    image: product.images.card,
    category: product.category,
    alsoIn: (product.alsoIn ?? []).filter((c) => c !== product.category),
    priceMinFils: Math.min(...prices),
    priceMaxFils: Math.max(...prices),
    // "Stock" here is AVAILABLE (set value − sold), the figure customers can still buy.
    stock: product.variants.reduce((n, v) => n + availableFromStock(v.stock, sold[v.sku] ?? 0), 0),
    hidden: Boolean(product.hidden),
    custom: isCustomSlug(product.slug),
    skus: product.variants.map((v) => v.sku),
    units: agg?.units ?? 0,
    orders: agg?.orders.size ?? 0,
    revenueFils: agg?.revenueFils ?? 0,
    sizes: sizesFromAgg(agg, product),
  };
}

const byUnitsThenName = (a: { units: number; name: string }, b: { units: number; name: string }) =>
  b.units - a.units || a.name.localeCompare(b.name);

export function analyzeProducts(input: {
  orders: AdminOrder[];
  catalog: Catalog;
  sold: SoldMap;
  filters: AnalysisFilters;
  locale: Locale;
  now: Date;
}): ProductAnalysis {
  const { catalog, sold, filters, locale, now } = input;
  const selected = selectOrders(input.orders, filters, now);

  // ── Roll up every selected line by product slug (and, within it, by SKU). ─────
  const bySlug = new Map<string, Agg>();
  const removedNames = new Map<string, string>();
  let totalUnits = 0;
  let totalRevenue = 0;

  for (const item of selected) {
    for (const line of item.order.lines) {
      let agg = bySlug.get(line.slug);
      if (!agg) {
        agg = emptyAgg();
        bySlug.set(line.slug, agg);
      }
      const lineTotal = line.priceFils * line.qty;
      agg.units += line.qty;
      agg.revenueFils += lineTotal;
      agg.orders.add(item.order.id);
      const size = agg.sizes.get(line.sku) ?? { size: line.size, units: 0, revenueFils: 0 };
      size.units += line.qty;
      size.revenueFils += lineTotal;
      agg.sizes.set(line.sku, size);
      if (!catalog.bySlug.has(line.slug) && !removedNames.has(line.slug)) {
        removedNames.set(line.slug, line.name);
      }
      totalUnits += line.qty;
      totalRevenue += lineTotal;
    }
  }

  // ── Per-product stats for the whole catalog (zero-sales products included). ───
  const allStats = catalog.products.map((p) => buildStat(p, bySlug.get(p.slug), sold));
  const matched = allStats.filter((s) => matchesProduct(s, filters.query, locale));

  // ── Group into category sections (a product shows in every category it lists in). ─
  const sections: CategorySection[] = catalog.categories.map((category) => {
    const products = matched
      .filter((s) => s.category === category.slug || s.alsoIn.includes(category.slug))
      .sort(byUnitsThenName);
    const orders = new Set<string>();
    for (const s of products) {
      const agg = bySlug.get(s.slug);
      if (agg) for (const id of agg.orders) orders.add(id);
    }
    return {
      slug: category.slug,
      name: category.name,
      products,
      units: products.reduce((n, s) => n + s.units, 0),
      orders: orders.size,
      revenueFils: products.reduce((n, s) => n + s.revenueFils, 0),
    };
  });

  // ── Lines whose product no longer exists in the catalog. ─────────────────────
  const removed: RemovedStat[] = [];
  for (const [slug, name] of removedNames) {
    const agg = bySlug.get(slug)!;
    const stat: RemovedStat = {
      slug,
      name,
      units: agg.units,
      orders: agg.orders.size,
      revenueFils: agg.revenueFils,
      sizes: sizesFromAgg(agg),
    };
    if (matchesRemoved(stat, filters.query)) removed.push(stat);
  }
  removed.sort(byUnitsThenName);

  // ── Summary reflects the filters (not the search); best seller from all products. ─
  const best = [...allStats].filter((s) => s.units > 0).sort(byUnitsThenName)[0];
  const summary: AnalysisSummary = {
    units: totalUnits,
    orders: selected.length,
    revenueFils: totalRevenue,
    bestSeller: best ? { name: best.name, units: best.units } : null,
  };

  const products = [...matched].sort(byUnitsThenName);

  return {
    sections,
    removed,
    products,
    summary,
    hasRows: products.length > 0 || removed.length > 0,
  };
}
