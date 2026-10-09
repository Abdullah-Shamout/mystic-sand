import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { ProductEditor, ProductEditorSkeleton } from "@/components/admin/products/product-editor";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("editor.meta") };
}

/** The editor reads ?p=<slug>|new via useSearchParams, so it needs a Suspense boundary. */
export default async function AdminProductEditPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<ProductEditorSkeleton />}>
      <ProductEditor />
    </Suspense>
  );
}
