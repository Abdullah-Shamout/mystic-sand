import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { isolate } from "@/components/product/constants";
import { OudIngredient } from "@/components/product/oud-ingredient";
import { ProductJsonLd } from "@/components/product/product-json-ld";
import { ProductView } from "@/components/product/product-view";
import type { Locale } from "@/i18n/routing";
import { baseCatalog } from "@/lib/catalog";

type Props = { params: Promise<{ locale: string; slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return baseCatalog.products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "product" });
  const product = baseCatalog.bySlug.get(slug);
  if (!product) return {};
  const l = locale as Locale;
  return {
    title: t("meta.title", { name: l === "ar" ? isolate(product.name) : product.name, type: product.type[l] }),
    description: t("meta.description", {
      tagline: product.tagline[l],
      type: product.type[l],
      size: product.variants.map((v) => v.size[l]).join(" / "),
    }),
  };
}

export default async function ProductPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const product = baseCatalog.bySlug.get(slug);
  if (!product) notFound();
  const l = locale as Locale;

  return (
    <>
      {/* Built from base data at build time; the live body is rendered by ProductView. */}
      <ProductJsonLd product={product} locale={l} />
      <ProductView slug={slug} extras={slug === "oud" ? <OudIngredient /> : null} />
    </>
  );
}
