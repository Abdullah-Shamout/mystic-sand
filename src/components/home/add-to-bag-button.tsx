"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useLiveProduct } from "@/lib/live";
import { useAddToBag } from "@/lib/use-add-to-bag";

/** Add-to-bag for editorial features: non-blocking toast with "View bag" / "Checkout". */
export function AddToBagButton({ slug, className }: { slug: string; className?: string }) {
  const t = useTranslations("common");
  const addToBag = useAddToBag();
  const product = useLiveProduct(slug);
  if (!product || product.hidden) return null;
  const variant = product.variants[0];
  const soldOut = variant.stock <= 0;

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
