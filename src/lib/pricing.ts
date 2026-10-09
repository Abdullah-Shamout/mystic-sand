import type { Product, Variant } from "@/data/types";
import { visibleBySku, type Catalog } from "@/lib/catalog";
import { getLiveCatalog, getLiveSettings } from "@/lib/live";
import { feeFor, type StoreSettings } from "@/lib/settings";

export type BagLine = { sku: string; qty: number };
export type DeliveryMethod = "standard" | "express";
export type Promo = { code: string; percent: number };

export type PricedLine = BagLine & {
  product: Product;
  variant: Variant;
  lineFils: number;
};

/**
 * Bag lines store only sku + qty; prices always come from the catalog. Hidden or unknown
 * SKUs are "missing", which the existing unavailable flow handles. Callers that run during
 * render pass the live catalog (useLiveCatalog()); handlers may rely on the default.
 */
export function priceLines(
  lines: BagLine[],
  catalog: Catalog = getLiveCatalog(),
): { priced: PricedLine[]; missing: BagLine[] } {
  const priced: PricedLine[] = [];
  const missing: BagLine[] = [];
  for (const line of lines) {
    const hit = visibleBySku(catalog, line.sku);
    if (!hit) {
      missing.push(line);
      continue;
    }
    priced.push({ ...line, product: hit.product, variant: hit.variant, lineFils: hit.variant.priceFils * line.qty });
  }
  return { priced, missing };
}

export type Totals = {
  itemCount: number;
  subtotalFils: number;
  discountFils: number;
  deliveryFils: number;
  totalFils: number;
};

export function computeTotals(input: {
  lines: BagLine[];
  deliveryMethod?: DeliveryMethod;
  promo?: Promo | null;
  catalog?: Catalog;
  settings?: StoreSettings;
}): Totals {
  const { priced } = priceLines(input.lines, input.catalog ?? getLiveCatalog());
  const itemCount = priced.reduce((n, l) => n + l.qty, 0);
  const subtotalFils = priced.reduce((n, l) => n + l.lineFils, 0);
  const discountFils = input.promo ? Math.round((subtotalFils * input.promo.percent) / 100) : 0;
  const merchandise = subtotalFils - discountFils;
  const method = input.deliveryMethod ?? "standard";
  // Delivery is always charged: there is no free-delivery threshold.
  const deliveryFils = itemCount === 0 ? 0 : feeFor(input.settings ?? getLiveSettings(), method);
  return {
    itemCount,
    subtotalFils,
    discountFils,
    deliveryFils,
    totalFils: merchandise + deliveryFils,
  };
}

/** Stable key of everything that affects the amount — used to reuse a pending order. */
export function bagKey(input: {
  lines: BagLine[];
  deliveryMethod: DeliveryMethod;
  promo: Promo | null;
}): string {
  const lines = [...input.lines]
    .sort((a, b) => a.sku.localeCompare(b.sku))
    .map((l) => `${l.sku}x${l.qty}`)
    .join(",");
  return `${lines}|${input.deliveryMethod}|${input.promo?.code ?? ""}`;
}
