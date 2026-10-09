import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { PaymentSkeleton } from "@/components/payment/payment-skeleton";
import PayView from "./pay-view";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "payment" });
  return { title: t("meta.payTitle") };
}

// The order and method arrive in the query string (?order=MS-10482&method=knet),
// which only exists in the browser: the view renders client-side inside Suspense.
export default async function PayPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<PaymentSkeleton />}>
      <PayView />
    </Suspense>
  );
}
