"use client";

import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { productHref } from "@/lib/catalog";
import { useLiveProduct } from "@/lib/live";
import { formatKWD } from "@/lib/money";
import { AddToBagButton } from "./add-to-bag-button";

/**
 * The product-dependent half of the AURA feature: live name, price, tagline and the
 * add-to-bag button. The Reem Kufi font (next/font, server-only) comes in as `signatureFont`.
 */
export function AuraPanel({ signatureFont }: { signatureFont: string }) {
  const t = useTranslations("home.aura");
  const locale = useLocale() as Locale;
  const product = useLiveProduct("aura");
  if (!product) return null;
  const variant = product.variants[0];

  return (
    <>
      <p className="caps text-[12px] md:text-[13px]">{t("eyebrow")}</p>
      <h2 id="aura-title" className="caps mt-3 font-serif text-[52px] leading-none font-medium md:text-[64px]">
        <bdi lang="en">{product.name}</bdi>
      </h2>
      {/* The brand line printed on the can, kept in Arabic in both languages. */}
      <p lang="ar" dir="rtl" className="mt-6 text-[26px] leading-[1.6] md:text-[30px]" style={{ fontFamily: signatureFont }}>
        {t("signature")}
      </p>
      {locale === "en" && <p className="mt-1 text-[14px] text-ink/70">{t("tagline")}</p>}
      <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-ink/85">{t("body")}</p>

      <p className="mt-8 flex items-baseline gap-3">
        <bdi className="figures text-[19px] font-medium">{formatKWD(variant.priceFils, locale)}</bdi>
        <span className="text-[14px] text-ink/70">
          <bdi>{variant.size[locale]}</bdi>
        </span>
      </p>
      <div className="mt-5 flex w-full max-w-sm flex-col items-center gap-1">
        <AddToBagButton slug={product.slug} />
        <Button asChild variant="link" className="min-h-11 text-[14px]">
          <Link href={productHref(product.slug)}>{t("cta")}</Link>
        </Button>
      </div>
    </>
  );
}
