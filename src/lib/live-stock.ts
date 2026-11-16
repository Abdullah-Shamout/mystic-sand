"use client";

import { useMemo } from "react";

import { type Catalog } from "@/lib/catalog";
import { getLiveCatalog, useLiveCatalog } from "@/lib/live";
import { availableFor } from "@/lib/stock";

/**
 * The live "available stock" per SKU. It now comes straight from the DB's authoritative
 * variants.stock, carried in the catalog data: availableFor(catalog, {}, sku) is the variant's set
 * stock (with hidden/unknown SKUs → 0). The old "catalog stock − ms-stock sold" subtraction is
 * superseded — stock MUTATION (decrement on purchase) stays on the client ms-stock path until
 * Phase 5, but it no longer feeds these reads. Because the server supplies real stock, there is no
 * mounted gate here anymore.
 */

const EMPTY_SOLD: Record<string, number> = {};

/** Render-safe: available(sku) = the DB catalog's set stock for that SKU (0 if hidden/unknown). */
export function useLiveStock(): { available: (sku: string) => number } {
  const catalog = useLiveCatalog();
  return useMemo(
    () => ({ available: (sku: string) => availableFor(catalog, EMPTY_SOLD, sku) }),
    [catalog],
  );
}

/** Event-handler / effect getter. Reads the DB catalog's set stock for a SKU. */
export function getLiveAvailable(sku: string, catalog: Catalog = getLiveCatalog()): number {
  return availableFor(catalog, EMPTY_SOLD, sku);
}
