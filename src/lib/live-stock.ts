import { useMemo } from "react";
import type { Catalog } from "@/lib/catalog";
import { useMounted } from "@/lib/hooks";
import { getLiveCatalog, useLiveCatalog } from "@/lib/live";
import { availableFor } from "@/lib/stock";
import { useStockStore, type SoldMap } from "@/store/stock";

/**
 * The live "available stock" per SKU — base stock until mounted, then the catalog's set value minus
 * units sold in this browser. Mirrors the hydration rules of useLiveCatalog: render code uses the
 * hook (so the static HTML and the first client render agree); handlers use getLiveAvailable.
 */

const EMPTY_SOLD: SoldMap = {};

/** Render-safe: available(sku) = base stock until mounted, then live catalog stock − sold. */
export function useLiveStock(): { available: (sku: string) => number } {
  const catalog = useLiveCatalog();
  const sold = useStockStore((s) => s.sold);
  const mounted = useMounted();
  const effectiveSold = mounted ? sold : EMPTY_SOLD;
  return useMemo(
    () => ({ available: (sku: string) => availableFor(catalog, effectiveSold, sku) }),
    [catalog, effectiveSold],
  );
}

/** Event-handler / effect getter. Base stock on the server, live available on the client. */
export function getLiveAvailable(sku: string, catalog: Catalog = getLiveCatalog()): number {
  const sold = typeof window === "undefined" ? EMPTY_SOLD : useStockStore.getState().sold;
  return availableFor(catalog, sold, sku);
}
