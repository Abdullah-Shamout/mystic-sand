"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { categoryBySlug } from "@/data/categories";
import { products, productsInCategory } from "@/data/products";
import type { Locale } from "@/i18n/routing";
import { ShopBanner } from "./shop-banner";
import { ShopToolbar } from "./shop-catalog";

const ALL_BANNER = { desktop: "lifestyle/hourglass-candles", mobile: "lifestyle/trio-basket" };

/**
 * Banner, collection chips, count and sort for /shop and every collection page. The
 * shop layout renders it, so it stays mounted when a chip is used and only the grid
 * below is swapped: the page holds its scroll position instead of jumping to the top.
 */
export function ShopFrame({ children }: { children: React.ReactNode }) {
  const t = useTranslations("shop");
  const locale = useLocale() as Locale;
  // The collection slug below /shop, or null on /shop itself.
  const segment = useSelectedLayoutSegment();
  const category = segment ? categoryBySlug(segment) : undefined;
  const count = category ? productsInCategory(category.slug).length : products.length;

  return (
    <>
      <ShopBanner
        title={category ? category.name[locale] : t("all.title")}
        description={category ? category.description[locale] : t("all.description")}
        image={category?.banner ?? ALL_BANNER}
      />
      <ShopToolbar active={category?.slug ?? "all"} count={count} />
      {children}
    </>
  );
}
