"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { useMounted } from "@/lib/hooks";
import { useLiveProduct } from "@/lib/live";
import { isolate } from "./constants";
import { ProductView } from "./product-view";

/** Skeleton for an admin-added product page, matching the two-column product layout. */
export function CustomProductSkeleton() {
  return (
    <div className="mx-auto max-w-[1720px] lg:grid lg:grid-cols-[minmax(0,58fr)_minmax(0,42fr)] lg:items-start" aria-busy>
      <div className="aspect-square bg-tile" />
      <div className="space-y-6 px-5 pt-6 pb-14 sm:px-8 lg:px-10 lg:pt-8 xl:px-16">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-10 w-3/5" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-[60px] w-full" />
        <Skeleton className="h-[60px] w-full" />
      </div>
    </div>
  );
}

/** Reads the ?p=<slug> query, waits for the store, then renders the product (or unavailable). */
export function CustomProductView() {
  const params = useSearchParams();
  const mounted = useMounted();
  const slug = params.get("p") ?? "";

  if (!mounted) return <CustomProductSkeleton />;
  return <CustomProduct slug={slug} />;
}

function CustomProduct({ slug }: { slug: string }) {
  const t = useTranslations("product");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const product = useLiveProduct(slug);

  // Static export has no server title for this query-string page: set it from the product.
  useEffect(() => {
    if (!product || product.hidden) return;
    const name = locale === "ar" ? isolate(product.name) : product.name;
    document.title = `${t("meta.title", { name, type: product.type[locale] })} · ${tc("brand")}`;
  }, [product, locale, t, tc]);

  return <ProductView slug={slug} />;
}
