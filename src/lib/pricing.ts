import { productBySku } from "@/data/products";
import { delivery } from "@/data/site";
import type { Product, Variant } from "@/data/types";

export type BagLine = { sku: string; qty: number };
export type DeliveryMethod = "standard" | "express";
export type Promo = { code: string; percent: number };

export type PricedLine = BagLine & {
  product: Product;
  variant: Variant;
  lineFils: number;
};

/** Bag lines store only sku + qty; prices always come from the catalog. */
export function priceLines(lines: BagLine[]): { priced: PricedLine[]; missing: BagLine[] } {
  const priced: PricedLine[] = [];
  const missing: BagLine[] = [];
  for (const line of lines) {
    const hit = productBySku(line.sku);
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
  /** Standard delivery becomes free at this merchandise total. */
  freeDeliveryThresholdFils: number;
  freeDeliveryRemainingFils: number;
  qualifiesFreeDelivery: boolean;
};

export function computeTotals(input: {
  lines: BagLine[];
  deliveryMethod?: DeliveryMethod;
  promo?: Promo | null;
}): Totals {
  const { priced } = priceLines(input.lines);
  const itemCount = priced.reduce((n, l) => n + l.qty, 0);
  const subtotalFils = priced.reduce((n, l) => n + l.lineFils, 0);
  const discountFils = input.promo ? Math.round((subtotalFils * input.promo.percent) / 100) : 0;
  const merchandise = subtotalFils - discountFils;
  const threshold = delivery.standard.freeOverFils;
  const qualifiesFreeDelivery = merchandise >= threshold;
  const method = input.deliveryMethod ?? "standard";
  const deliveryFils =
    itemCount === 0
      ? 0
      : method === "express"
        ? delivery.express.feeFils
        : qualifiesFreeDelivery
          ? 0
          : delivery.standard.feeFils;
  return {
    itemCount,
    subtotalFils,
    discountFils,
    deliveryFils,
    totalFils: merchandise + deliveryFils,
    freeDeliveryThresholdFils: threshold,
    freeDeliveryRemainingFils: Math.max(0, threshold - merchandise),
    qualifiesFreeDelivery,
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
