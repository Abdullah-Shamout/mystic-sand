import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ShopView } from "@/components/shop/shop-view";
import { categories, categoryBySlug } from "@/data/categories";
import { delivery } from "@/data/site";
import type { Locale } from "@/i18n/routing";
import { formatKWD } from "@/lib/money";

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
    description: t("meta.description", {
      text: category.description[l],
      amount: formatKWD(delivery.standard.freeOverFils, l),
    }),
  };
}

export default async function CategoryPage({ params }: Props) {
  const { locale, category: slug } = await params;
  setRequestLocale(locale);
  const category = categoryBySlug(slug);
  if (!category) notFound();
  return <ShopView locale={locale as Locale} category={category} />;
}
