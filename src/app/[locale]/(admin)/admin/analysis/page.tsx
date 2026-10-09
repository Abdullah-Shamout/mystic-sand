import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProductAnalysis } from "@/components/admin/analysis/product-analysis";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("analysis.meta") };
}

export default async function AdminAnalysisPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ProductAnalysis />;
}
