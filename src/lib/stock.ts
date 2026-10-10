import type { Product } from "@/data/types";
import { visibleBySku, type Catalog } from "@/lib/catalog";
import type { SoldMap } from "@/store/stock";

// Pure stock maths (no React, no zustand). "Available" is the catalog's set stock minus the units
// sold since it was set, never below zero. Storefront callers read through visibleBySku, so a hidden
// or unknown SKU is never buyable; the admin computes available straight from a variant's stock.

/** Available from a raw set value and its sold counter, clamped at zero. */
export const availableFromStock = (stock: number, sold: number): number => Math.max(0, stock - sold);

/** Available for a SKU on the storefront: 0 for a hidden or unknown SKU. */
export function availableFor(catalog: Catalog, sold: SoldMap, sku: string): number {
  const hit = visibleBySku(catalog, sku);
  if (!hit) return 0;
  return availableFromStock(hit.variant.stock, sold[sku] ?? 0);
}

/** True when every one of a product's sizes is out of stock. */
export function isSoldOut(product: Product, sold: SoldMap): boolean {
  return product.variants.every((v) => availableFromStock(v.stock, sold[v.sku] ?? 0) <= 0);
}

/** How many of a SKU are "low" but still in stock (1..LOW_STOCK) — drives the "Only N left" hints. */
export const LOW_STOCK = 3;
