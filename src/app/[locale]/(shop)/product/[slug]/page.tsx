import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { isolate, PDP_END_ID } from "@/components/product/constants";
import { NotesBand } from "@/components/product/notes-band";
import { OudIngredient } from "@/components/product/oud-ingredient";
import { ProductAccordions } from "@/components/product/product-accordions";
import { ProductBreadcrumb } from "@/components/product/product-breadcrumb";
import { ProductGallery } from "@/components/product/product-gallery";
import { ProductGrid } from "@/components/product/product-grid";
import { ProductJsonLd } from "@/components/product/product-json-ld";
import { ProductPurchase } from "@/components/product/product-purchase";
import { StickyColumn } from "@/components/product/sticky-column";
import { SectionTitle } from "@/components/ui/section-title";
import { categoryBySlug } from "@/data/categories";
import { productBySlug, products } from "@/data/products";
import type { Product } from "@/data/types";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";

type Props = { params: Promise<{ locale: string; slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "product" });
  const product = productBySlug(slug);
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
  const product = productBySlug(slug);
  if (!product) notFound();
  const l = locale as Locale;
  const t = await getTranslations("product");
  const category = categoryBySlug(product.category);
  const related = product.related.map(productBySlug).filter((p): p is Product => Boolean(p));
  // The Trilogy, else the collection — except Perfumes, which the type line already says.
  const eyebrow =
    product.collection === "trilogy" ? t("trilogy") : category && category.slug !== "perfumes" ? category.name[l] : null;

  return (
    <>
      <ProductJsonLd product={product} locale={l} />

      <div className="mx-auto max-w-[1720px] lg:grid lg:grid-cols-[minmax(0,58fr)_minmax(0,42fr)] lg:items-start">
        {/* Desktop: the photo stays in view while the details beside it scroll. */}
        <div className="lg:sticky lg:top-[89px] lg:bg-tile">
          <ProductGallery images={product.images.gallery} name={product.name} />
        </div>

        <StickyColumn className="px-5 pt-6 pb-14 sm:px-8 lg:px-10 lg:pt-8 lg:pb-12 xl:px-16">
          <ProductBreadcrumb name={product.name} category={category} locale={l} />
          {eyebrow && <p className="caps mt-5 text-[12px] text-muted">{eyebrow}</p>}
          <h1 className={cn("caps font-serif text-[34px] leading-[1.08] font-medium lg:text-[44px]", eyebrow ? "mt-2" : "mt-5")}>
            <bdi lang="en">{product.name}</bdi>
          </h1>
          <p className="caps mt-2 text-[13px] text-muted">
            {product.type[l]}
            {product.family && (
              <>
                <span aria-hidden className="mx-2">
                  |
                </span>
                {product.family[l]}
              </>
            )}
          </p>
          <ProductPurchase product={product} />
          <ProductAccordions product={product} locale={l} />
        </StickyColumn>
      </div>

      {product.notes && <NotesBand notes={product.notes} locale={l} />}
      {product.slug === "oud" && <OudIngredient />}

      {related.length > 0 && (
        <section>
          <SectionTitle title={t("related")} />
          <ProductGrid products={related} />
        </section>
      )}
      <div id={PDP_END_ID} aria-hidden />
    </>
  );
}
