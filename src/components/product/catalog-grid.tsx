"use client";

import type { Product } from "@/data/types";
import { useLiveCatalog } from "@/lib/live";
import { ProductGrid } from "./product-grid";

/**
 * A ProductGrid built from the live catalog: the visible products for `slugs`, in that
 * order. Used wherever a fixed set of products is shown (home grids, checkout empty state).
 */
export function CatalogGrid({
  slugs,
  columns = 4,
  priorityCount = 0,
}: {
  slugs: string[];
  columns?: 3 | 4;
  priorityCount?: number;
}) {
  const catalog = useLiveCatalog();
  const products = slugs
    .map((slug) => catalog.bySlug.get(slug))
    .filter((p): p is Product => p !== undefined && !p.hidden);
  return <ProductGrid products={products} columns={columns} priorityCount={priorityCount} />;
}
