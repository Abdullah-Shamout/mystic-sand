import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PolicyPage } from "@/components/content/policy-page";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  return { title: t("refund.meta.title"), description: t("refund.meta.description") };
}

export default async function RefundPolicyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PolicyPage policy="refund" locale={locale as Locale} />;
}
