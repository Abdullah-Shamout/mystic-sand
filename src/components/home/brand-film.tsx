"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { asset } from "@/lib/asset";
import { HOME_DEFAULTS, liveHref, textOr } from "@/lib/home";
import { useReducedMotion } from "@/lib/hooks";
import { useLiveCatalog, useLiveHome } from "@/lib/live";

/**
 * The 9:16 brand film beside its text. Texts and the button come from the home overrides; the video
 * stays fixed. Like the hero it plays muted on a loop with no controls (the client's choice):
 * nothing downloads until it nears the screen, it plays while in view, and reduced motion keeps the
 * poster.
 */
export function BrandFilm({ id = "brand-film" }: { id?: string }) {
  const t = useTranslations("home.film");
  const locale = useLocale() as Locale;
  const o = useLiveHome().film;
  const catalog = useLiveCatalog();
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduced = useReducedMotion();

  const href = liveHref(o?.href, catalog, HOME_DEFAULTS.film.href);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || reduced) return;
    // React does not reliably reflect `muted`; browsers only autoplay muted video.
    video.muted = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { rootMargin: "120px 0px" },
    );
    io.observe(video);
    return () => {
      io.disconnect();
      video.pause();
    };
  }, [reduced]);

  return (
    <section aria-labelledby={id} data-home-section="film" className="bg-ink text-cream [&_:focus-visible]:outline-cream">
      <div className="mx-auto grid max-w-[1200px] items-center md:grid-cols-2 md:gap-12 md:px-10 md:py-20 lg:gap-20">
        <div className="relative mx-auto aspect-[9/16] max-h-[calc(100svh-65px)] w-full max-w-full overflow-hidden bg-ink md:max-h-none md:w-[min(440px,calc((100svh_-_200px)*9/16))]">
          <video
            ref={videoRef}
            src={asset("/videos/film.mp4")}
            poster={asset("/videos/film-poster.webp")}
            muted
            loop
            playsInline
            preload="none"
            disablePictureInPicture
            disableRemotePlayback
            aria-label={t("videoLabel")}
            className="pointer-events-none absolute inset-0 size-full object-cover"
          />
        </div>

        <Reveal className="px-6 py-14 text-center md:px-0 md:py-0 md:text-start">
          <p className="caps text-[12px] text-cream/70 [overflow-wrap:anywhere] md:text-[13px]">{textOr(o?.eyebrow, locale, t("eyebrow"))}</p>
          <h2 id={id} className="caps mt-3 font-serif text-title-sm font-medium [overflow-wrap:anywhere] md:text-title">
            {textOr(o?.title, locale, t("title"))}
          </h2>
          <p className="mx-auto mt-5 max-w-md text-[16px] leading-[1.8] text-cream/80 [overflow-wrap:anywhere] md:mx-0">{textOr(o?.body, locale, t("body"))}</p>
          <Button asChild variant="outline-light" className="mt-8">
            <Link href={href}>{textOr(o?.cta, locale, t("cta"))}</Link>
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
