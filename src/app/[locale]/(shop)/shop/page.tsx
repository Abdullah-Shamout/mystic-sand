import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShopView } from "@/components/shop/shop-view";
import { delivery } from "@/data/site";
import type { Locale } from "@/i18n/routing";
import { formatKWD } from "@/lib/money";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "shop" });
  return {
    title: t("all.title"),
    description: t("meta.description", {
      text: t("all.description"),
      amount: formatKWD(delivery.standard.freeOverFils, locale as Locale),
    }),
  };
}

export default async function ShopPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ShopView locale={locale as Locale} />;
}
