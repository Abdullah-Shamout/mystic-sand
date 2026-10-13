"use client";

import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { Product } from "@/data/types";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { productHref } from "@/lib/catalog";
import { textOr, type FeatureOverrides } from "@/lib/home";
import { formatKWD } from "@/lib/money";
import { AddToBagButton } from "./add-to-bag-button";

/**
 * The product-dependent half of the featured panel: the live name, price, tagline and add-to-bag
 * button, with the eyebrow/body/cta/signature/line from the home overrides (the texts were written
 * for AURA). The Reem Kufi font (next/font, server-only) comes in as `signatureFont`.
 */
export function AuraPanel({
  product,
  overrides,
  signatureFont,
}: {
  product: Product;
  overrides?: FeatureOverrides;
  signatureFont: string;
}) {
  const t = useTranslations("home.aura");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const variant = product.variants[0];
  const line = overrides?.line ?? t("tagline");
  // Several sizes: show "From <lowest price>" and a "Choose size" link instead of add-to-bag.
  const multi = product.variants.length > 1;
  const fromFils = Math.min(...product.variants.map((v) => v.priceFils));

  return (
    <>
      <p className="caps text-[12px] [overflow-wrap:anywhere] md:text-[13px]">{textOr(overrides?.eyebrow, locale, t("eyebrow"))}</p>
      <h2 id="aura-title" className="caps mt-3 font-serif text-[52px] leading-none font-medium [overflow-wrap:anywhere] md:text-[64px]">
        <bdi lang="en">{product.name}</bdi>
      </h2>
      {/* The brand line printed on the can, kept in Arabic in both languages. */}
      <p lang="ar" dir="rtl" className="mt-6 text-[26px] leading-[1.6] [overflow-wrap:anywhere] md:text-[30px]" style={{ fontFamily: signatureFont }}>
        {overrides?.signature ?? t("signature")}
      </p>
      {locale === "en" && <p className="mt-1 text-[14px] text-ink/70 [overflow-wrap:anywhere]">{line}</p>}
      <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-ink/85 [overflow-wrap:anywhere]">{textOr(overrides?.body, locale, t("body"))}</p>

      <p className="mt-8 flex items-baseline gap-3">
        {multi ? (
          <bdi className="figures text-[19px] font-medium">{tc("product.from", { price: formatKWD(fromFils, locale) })}</bdi>
        ) : (
          <>
            <bdi className="figures text-[19px] font-medium">{formatKWD(variant.priceFils, locale)}</bdi>
            <span className="text-[14px] text-ink/70">
              <bdi>{variant.size[locale]}</bdi>
            </span>
          </>
        )}
      </p>
      <div className="mt-5 flex w-full max-w-sm flex-col items-center gap-1">
        {multi ? (
          <Button asChild size="lg" block>
            <Link href={productHref(product.slug)}>{tc("product.chooseSize")}</Link>
          </Button>
        ) : (
          <AddToBagButton slug={product.slug} />
        )}
        <Button asChild variant="link" className="min-h-11 text-[14px]">
          <Link href={productHref(product.slug)}>{textOr(overrides?.cta, locale, t("cta"))}</Link>
        </Button>
      </div>
    </>
  );
}
