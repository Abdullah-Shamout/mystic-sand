import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ShopGrid } from "@/components/shop/shop-catalog";
import { categories, categoryBySlug } from "@/data/categories";
import { baseCatalog, productsIn } from "@/lib/catalog";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string; category: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return categories.map((c) => ({ category: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, category: slug } = await params;
  const t = await getTranslations({ locale, namespace: "shop" });
  const category = categoryBySlug(slug);
  if (!category) return {};
  const l = locale as Locale;
  return {
    title: category.name[l],
    description: t("meta.description", { text: category.description[l] }),
  };
}

export default async function CategoryPage({ params }: Props) {
  const { locale, category: slug } = await params;
  setRequestLocale(locale);
  const category = categoryBySlug(slug);
  if (!category) notFound();
  return <ShopGrid slugs={productsIn(baseCatalog, category.slug).map((p) => p.slug)} />;
}
