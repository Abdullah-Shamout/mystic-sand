"use client";

import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import type { Product } from "@/data/types";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { productHref } from "@/lib/catalog";
import { HOME_DEFAULTS, sceneImage, textOr } from "@/lib/home";
import { useLiveCatalog, useLiveHome } from "@/lib/live";
import { hasImage } from "@/lib/media";

/** Two signature products (CAFÉ and OUD by default): equal full-height halves, stacked on phones. */
export function SignatureDuo() {
  const t = useTranslations("home.duo");
  const locale = useLocale() as Locale;
  const o = useLiveHome().duo;
  const catalog = useLiveCatalog();
  const defaults = HOME_DEFAULTS.duo.products;

  // One slot per position: the chosen (or default) product, skipping hidden/missing and any repeat.
  const used = new Set<string>();
  const slots: { key: string; product: Product; image: string; custom: boolean }[] = [];
  for (let i = 0; i < 2; i++) {
    const slug = o?.items?.[i]?.product ?? defaults[i];
    const product = catalog.bySlug.get(slug);
    if (!product || product.hidden || used.has(product.slug)) continue;
    used.add(product.slug);
    const customKey = o?.items?.[i]?.image;
    const custom = customKey ? hasImage(customKey) : false;
    slots.push({ key: `${i}-${product.slug}`, product, image: custom ? customKey! : sceneImage(product), custom });
  }
  if (slots.length === 0) return null;

  return (
    <section data-home-section="duo" className="grid md:grid-cols-2 [&_:focus-visible]:outline-cream">
      {slots.map(({ key, product, image, custom }, i) => (
        <Link
          key={key}
          href={productHref(product.slug)}
          className="group relative block aspect-[3/5] overflow-hidden bg-tile text-cream sm:aspect-[4/5] lg:aspect-auto lg:h-[calc(100svh-129px)] lg:min-h-[600px]"
        >
          <ResponsiveImage
            image={image}
            alt={custom ? "" : t("alt", { name: product.name })}
            sizes="(min-width: 768px) 50vw, 100vw"
            className="absolute inset-0 transition-transform duration-500 ease-[var(--ease-soft)] group-hover:scale-[1.03]"
          />
          {/* Deeper scrim: the stone faces in these renders are light, so cream type needs the extra contrast. */}
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-[62%] bg-linear-to-t from-ink/80 via-ink/40 to-transparent" />
          <Reveal index={i} className="absolute inset-x-0 bottom-0 flex flex-col items-center px-6 pb-10 text-center md:pb-12 lg:pb-14">
            <p className="text-[13px] text-cream/85">
              {product.type[locale]} · <bdi className="whitespace-nowrap">{product.variants[0].size[locale]}</bdi>
            </p>
            <h2 className="caps mt-1 font-serif text-[34px] leading-none font-medium md:text-[42px]">
              <bdi lang="en">{product.name}</bdi>
            </h2>
            <p className="mt-3 max-w-xs text-[15px] leading-snug text-cream/90">{product.tagline[locale]}</p>
            <Button asChild variant="light" size="sm" className="mt-5 min-w-36 group-hover:border-ink group-hover:bg-ink group-hover:text-paper">
              <span>{textOr(o?.cta, locale, t("cta"))}</span>
            </Button>
          </Reveal>
        </Link>
      ))}
    </section>
  );
}
