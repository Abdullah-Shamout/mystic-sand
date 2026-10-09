"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { Reveal } from "@/components/ui/reveal";
import { Link } from "@/i18n/navigation";
import { productHref } from "@/lib/catalog";
import { useLiveProduct } from "@/lib/live";

const CHIPS_SLUG = "oud-chips";

/**
 * OUD only: the raw ingredient, with a path to the Natural Oud Chips. The packshot is
 * cropped in close, so it reads as the wood itself rather than a repeat of the gallery.
 * Shown only while the chips are visible in the live catalog, with their live name.
 */
export function OudIngredient() {
  const t = useTranslations("product.oud");
  const chips = useLiveProduct(CHIPS_SLUG);
  if (!chips || chips.hidden) return null;

  return (
    <section aria-labelledby="oud-title" className="grid bg-tile md:grid-cols-2">
      <div className="relative aspect-square overflow-hidden md:aspect-auto md:min-h-[560px]">
        <ResponsiveImage
          image={chips.images.card}
          alt={chips.name}
          sizes="(min-width: 768px) 75vw, 150vw"
          className="absolute inset-0 scale-[1.6] object-[50%_42%]"
        />
      </div>
      <Reveal className="flex flex-col items-center justify-center bg-paper px-6 py-16 text-center md:px-16">
        <p className="caps text-[12px] text-muted">{t("eyebrow")}</p>
        <h2 id="oud-title" className="caps mt-3 font-serif text-title-sm font-medium md:text-title">
          {t("title")}
        </h2>
        <p className="mt-5 max-w-md text-[16px] leading-[1.8] text-muted">
          {t.rich("text", { product: (chunks) => <bdi lang="en">{chunks}</bdi> })}
        </p>
        <Button asChild variant="secondary" className="mt-8">
          <Link href={productHref(CHIPS_SLUG)}>
            {t("cta")} <bdi lang="en">{chips.name}</bdi>
          </Link>
        </Button>
      </Reveal>
    </section>
  );
}
