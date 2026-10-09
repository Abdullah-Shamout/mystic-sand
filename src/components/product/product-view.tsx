"use client";

import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { SectionTitle } from "@/components/ui/section-title";
import type { Product } from "@/data/types";
import type { Locale } from "@/i18n/routing";
import { isCustomSlug } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import { useLiveCatalog, useLiveProduct } from "@/lib/live";
import { PDP_END_ID } from "./constants";
import { NotesBand } from "./notes-band";
import { ProductAccordions } from "./product-accordions";
import { ProductBreadcrumb } from "./product-breadcrumb";
import { ProductGallery } from "./product-gallery";
import { ProductGrid } from "./product-grid";
import { ProductPurchase } from "./product-purchase";
import { ProductUnavailable } from "./product-unavailable";
import { StickyColumn } from "./sticky-column";

const MAX_RELATED = 4;

/**
 * The whole product page body for one slug, read from the live catalog. Renders the
 * "unavailable" state when the product is hidden, deleted or unknown. `extras` is an
 * optional slot rendered after the notes band (the oud ingredient on OUD).
 */
export function ProductView({ slug, extras }: { slug: string; extras?: ReactNode }) {
  const t = useTranslations("product");
  const locale = useLocale() as Locale;
  const catalog = useLiveCatalog();
  const product = useLiveProduct(slug);

  if (!product || product.hidden) return <ProductUnavailable />;

  const category = catalog.categories.find((c) => c.slug === product.category);
  // The Trilogy, else the collection — except Perfumes, which the type line already says.
  const eyebrow =
    product.collection === "trilogy"
      ? t("trilogy")
      : category && category.slug !== "perfumes"
        ? category.name[locale]
        : null;

  // Related: the product's own list, kept to products that still exist and are visible.
  // Custom products rarely carry a related list, so fall back to others in their category.
  let related = product.related
    .map((s) => catalog.bySlug.get(s))
    .filter((p): p is Product => p !== undefined && !p.hidden);
  if (related.length === 0 && isCustomSlug(product.slug)) {
    related = catalog.visible
      .filter((p) => p.slug !== product.slug && p.category === product.category)
      .slice(0, MAX_RELATED);
  }

  return (
    <>
      <div className="mx-auto max-w-[1720px] lg:grid lg:grid-cols-[minmax(0,58fr)_minmax(0,42fr)] lg:items-start">
        {/* Desktop: the photo stays in view while the details beside it scroll. */}
        <div className="lg:sticky lg:top-[89px] lg:bg-tile">
          <ProductGallery images={product.images.gallery} name={product.name} />
        </div>

        <StickyColumn className="px-5 pt-6 pb-14 sm:px-8 lg:px-10 lg:pt-8 lg:pb-12 xl:px-16">
          <ProductBreadcrumb name={product.name} category={category} />
          {eyebrow && <p className="caps mt-5 text-[12px] text-muted">{eyebrow}</p>}
          <h1 className={cn("caps font-serif text-[34px] leading-[1.08] font-medium lg:text-[44px]", eyebrow ? "mt-2" : "mt-5")}>
            <bdi lang="en">{product.name}</bdi>
          </h1>
          <p className="caps mt-2 text-[13px] text-muted">
            {product.type[locale]}
            {product.family && (
              <>
                <span aria-hidden className="mx-2">
                  |
                </span>
                {product.family[locale]}
              </>
            )}
          </p>
          {/* Reset the size/quantity state whenever the live variants change. */}
          <ProductPurchase key={JSON.stringify(product.variants)} product={product} />
          <ProductAccordions product={product} />
        </StickyColumn>
      </div>

      {product.notes && <NotesBand notes={product.notes} />}
      {extras}

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
