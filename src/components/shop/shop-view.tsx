import { getTranslations } from "next-intl/server";
import type { Category } from "@/data/categories";
import { products, productsInCategory } from "@/data/products";
import type { Locale } from "@/i18n/routing";
import { ShopBanner } from "./shop-banner";
import { ShopCatalog } from "./shop-catalog";

const ALL_BANNER = { desktop: "lifestyle/hourglass-candles", mobile: "lifestyle/trio-basket" };

/** /shop and /shop/[category]: banner, chips, count, sort and the hairline grid. */
export async function ShopView({ locale, category }: { locale: Locale; category?: Category }) {
  const t = await getTranslations("shop");
  const list = category ? productsInCategory(category.slug) : products;
  return (
    <>
      <ShopBanner
        title={category ? category.name[locale] : t("all.title")}
        description={category ? category.description[locale] : t("all.description")}
        image={category?.banner ?? ALL_BANNER}
      />
      <ShopCatalog active={category?.slug ?? "all"} slugs={list.map((p) => p.slug)} />
    </>
  );
}
