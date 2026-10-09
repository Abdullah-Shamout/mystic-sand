import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProductsList } from "@/components/admin/products/products-list";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("products.meta") };
}

export default async function AdminProductsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ProductsList />;
}
