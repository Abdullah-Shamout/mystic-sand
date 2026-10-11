"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useLiveCatalog, useLiveProduct } from "@/lib/live";
import { useLiveStock } from "@/lib/live-stock";
import { useAddToBag } from "@/lib/use-add-to-bag";

/** Add-to-bag for editorial features: non-blocking toast with "View bag" / "Checkout". */
export function AddToBagButton({ slug, className }: { slug: string; className?: string }) {
  const t = useTranslations("common");
  const addToBag = useAddToBag();
  const product = useLiveProduct(slug);
  const catalog = useLiveCatalog();
  const stock = useLiveStock();
  if (!product || product.hidden) return null;
  const variant = product.variants[0];
  // Sold out when the stock ledger says so (available = set value − units sold), like ProductCard.
  const available = catalog.bySku.has(variant.sku) ? stock.available(variant.sku) : variant.stock;
  const soldOut = available <= 0;

  return (
    <Button
      size="lg"
      block
      className={className}
      disabled={soldOut}
      onClick={() => addToBag(product, variant)}
      data-testid={`feature-add-${slug}`}
    >
      {soldOut ? t("product.soldOut") : t("product.addToBag")}
    </Button>
  );
}
