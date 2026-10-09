import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SettingsPage } from "@/components/admin/settings/settings-page";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("settings.meta") };
}

export default async function AdminSettingsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SettingsPage />;
}
