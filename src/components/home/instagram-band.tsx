"use client";

import { useLocale, useTranslations } from "next-intl";
import { Reveal } from "@/components/ui/reveal";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { site } from "@/data/site";
import type { Locale } from "@/i18n/routing";
import { HOME_DEFAULTS, textOr } from "@/lib/home";
import { useLiveHome } from "@/lib/live";
import { hasImage } from "@/lib/media";

// Clean renders alternating with the darker lifestyle shots; six slots, each editable.
export function InstagramBand() {
  const t = useTranslations("home.instagram");
  const locale = useLocale() as Locale;
  const o = useLiveHome().instagram;
  const handle = `@${site.instagram.handle}`;

  // A custom photo wins only when it still exists; a deleted upload falls back to the original tile.
  const tiles = HOME_DEFAULTS.instagram.photos.map((original, i) => {
    const custom = o?.photos?.[i];
    return custom && hasImage(custom) ? custom : original;
  });

  return (
    <section aria-labelledby="instagram-title" data-home-section="instagram" className="bg-paper">
      {/* Decorative mosaic: plain photos (not links); the handle below opens Instagram. */}
      <ul aria-hidden className="grid grid-cols-3 md:grid-cols-6">
        {tiles.map((image, i) => (
          <li key={i} className="relative aspect-square overflow-hidden bg-tile">
            <ResponsiveImage image={image} alt="" sizes="(min-width: 768px) 17vw, 34vw" />
          </li>
        ))}
      </ul>
      <Reveal className="mx-auto max-w-3xl px-6 pt-12 pb-16 text-center md:pt-14 md:pb-20">
        <h2 id="instagram-title" className="font-serif text-title-sm font-medium md:text-title">
          <a
            href={site.instagram.url}
            target="_blank"
            rel="noreferrer"
            className="decoration-1 underline-offset-[6px] transition-colors hover:underline"
          >
            <bdi dir="ltr">{handle}</bdi>
            <span className="sr-only"> ({t("newTab")})</span>
          </a>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[15px] text-muted [overflow-wrap:anywhere]">{textOr(o?.subtitle, locale, t("subtitle"))}</p>
      </Reveal>
    </section>
  );
}
