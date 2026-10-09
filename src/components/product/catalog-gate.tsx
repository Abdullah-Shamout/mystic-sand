"use client";

import type { ReactNode } from "react";
import { useLiveProduct } from "@/lib/live";

/**
 * Renders its children only while the product `slug` exists and is visible in the live
 * catalog. Shows the base state during SSR/hydration, then follows the admin's edits.
 */
export function CatalogGate({ slug, children }: { slug: string; children: ReactNode }) {
  const product = useLiveProduct(slug);
  if (!product || product.hidden) return null;
  return <>{children}</>;
}
