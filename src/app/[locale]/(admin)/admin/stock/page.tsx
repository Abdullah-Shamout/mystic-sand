import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { StockPage } from "@/components/admin/stock/stock-page";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("stock.meta") };
}

export default async function AdminStockPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <StockPage />;
}
