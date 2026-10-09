import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { PaymentSkeleton } from "@/components/payment/payment-skeleton";
import ResultView from "./result-view";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "payment" });
  return { title: t("meta.resultTitle") };
}

// Returned to from the gateway as /checkout/result?order=…&paymentid=…&result=… —
// query strings only exist in the browser, so the view renders inside Suspense.
export default async function ResultPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<PaymentSkeleton variant="result" />}>
      <ResultView />
    </Suspense>
  );
}
