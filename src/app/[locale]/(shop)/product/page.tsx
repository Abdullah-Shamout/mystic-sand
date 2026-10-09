import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { CustomProductSkeleton, CustomProductView } from "@/components/product/custom-product-view";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "product" });
  return { title: t("custom.metaTitle") };
}

/**
 * Admin-added (custom) products live at /product?p=<slug>, read on the client. The
 * useSearchParams hook needs a Suspense boundary so the shell can still be prerendered.
 */
export default async function CustomProductPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<CustomProductSkeleton />}>
      <CustomProductView />
    </Suspense>
  );
}
