import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { OrdersDashboard } from "@/components/admin/orders/orders-dashboard";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("orders.meta") };
}

/** The orders dashboard reads ?order= via useSearchParams, so it needs a Suspense boundary. */
export default async function AdminOrdersPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense>
      <OrdersDashboard />
    </Suspense>
  );
}
