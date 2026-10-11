"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import { HOME_DEFAULTS, liveHref, textOr } from "@/lib/home";
import { useLiveCatalog, useLiveHome } from "@/lib/live";
import { hasImage } from "@/lib/media";
import { ImagePanel } from "./image-panel";

/**
 * The "Born of sand and time" story panel. Texts, link and photos come from the home overrides.
 * When only the computer photo is changed, phones show it too (rather than the built-in phone art);
 * a custom photo gets an empty alt and drops the built-in focal crop, and packshots don't blend.
 */
export function StoryPanel() {
  const t = useTranslations("home.story");
  const locale = useLocale() as Locale;
  const o = useLiveHome().story;
  const catalog = useLiveCatalog();

  const customDesktop = o?.image && hasImage(o.image) ? o.image : undefined;
  const customMobile = o?.mobileImage && hasImage(o.mobileImage) ? o.mobileImage : undefined;

  const image = customDesktop ?? HOME_DEFAULTS.story.image;
  const mobile = customMobile ?? customDesktop ?? HOME_DEFAULTS.story.mobileImage;
  const anyCustom = Boolean(customDesktop || customMobile);

  return (
    <ImagePanel
      image={image}
      mobile={mobile}
      alt={customDesktop ? "" : t("alt")}
      mobileAlt={customMobile || customDesktop ? "" : t("altMobile")}
      title={textOr(o?.title, locale, t("title"))}
      cta={{ href: liveHref(o?.href, catalog, HOME_DEFAULTS.story.href), label: textOr(o?.cta, locale, t("cta")) }}
      imageClassName={anyCustom ? undefined : "object-[28%_50%]"}
      className="h-[75svh] min-h-[480px] md:h-[85svh]"
      homeSection="story"
      blend={false}
    />
  );
}
