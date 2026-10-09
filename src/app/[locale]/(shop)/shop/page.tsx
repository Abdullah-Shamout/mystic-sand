import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShopGrid } from "@/components/shop/shop-catalog";
import { baseCatalog } from "@/lib/catalog";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "shop" });
  return {
    title: t("all.title"),
    description: t("meta.description", { text: t("all.description") }),
  };
}

export default async function ShopPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ShopGrid slugs={baseCatalog.visible.map((p) => p.slug)} />;
}
