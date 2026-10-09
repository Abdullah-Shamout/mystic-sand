import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("products.meta") };
}

export default async function AdminProductsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "admin" });
  return (
    <div className="max-w-2xl">
      <h1 className="caps font-serif text-title font-medium">{t("products.title")}</h1>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">{t("placeholder")}</p>
    </div>
  );
}
