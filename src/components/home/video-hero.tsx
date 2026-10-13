"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { asset } from "@/lib/asset";
import { HOME_DEFAULTS, liveHref, textOr } from "@/lib/home";
import { useMediaQuery, useMounted, useReducedMotion } from "@/lib/hooks";
import { useLiveCatalog, useLiveHome } from "@/lib/live";

const DESKTOP = { src: "/videos/hero-desktop.mp4", poster: "/videos/hero-desktop-poster.webp" };
const MOBILE = { src: "/videos/hero-mobile.mp4", poster: "/videos/hero-mobile-poster.webp" };

/**
 * Full-bleed hero (height = viewport minus ticker and header). The static HTML shows
 * the art-directed posters; after mount ONE source is chosen for the screen size, so
 * only one file downloads. The video plays muted on a loop, with no controls (the
 * client's choice); it rests while scrolled out of view, and reduced motion keeps the
 * poster.
 */
export function VideoHero() {
  const t = useTranslations("home.hero");
  const locale = useLocale() as Locale;
  const o = useLiveHome().hero;
  const catalog = useLiveCatalog();
  const mounted = useMounted();
  const desktop = useMediaQuery("(min-width: 768px)");
  const reduced = useReducedMotion();
  const source = mounted && !reduced ? (desktop ? DESKTOP : MOBILE) : null;
  const videoRef = useRef<HTMLVideoElement>(null);

  const href = liveHref(o?.href, catalog, HOME_DEFAULTS.hero.href);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // React does not reliably reflect `muted`; browsers only autoplay muted video.
    video.muted = true;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) video.play().catch(() => {});
      else video.pause();
    });
    io.observe(video);
    return () => io.disconnect();
  }, [source]);

  return (
    <section
      aria-labelledby="hero-title"
      data-home-section="hero"
      className="relative isolate h-[calc(100svh-105px)] min-h-[520px] overflow-hidden bg-ink text-cream lg:h-[calc(100svh-129px)] [&_:focus-visible]:outline-cream"
    >
      <picture>
        <source media="(min-width: 768px)" srcSet={asset(DESKTOP.poster)} />
        <img
          src={asset(MOBILE.poster)}
          alt=""
          width={720}
          height={1280}
          fetchPriority="high"
          className="absolute inset-0 size-full object-cover"
        />
      </picture>

      {source && (
        <video
          key={source.src}
          ref={videoRef}
          src={asset(source.src)}
          poster={asset(source.poster)}
          muted
          loop
          autoPlay
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          aria-hidden
          tabIndex={-1}
          className="pointer-events-none absolute inset-0 size-full object-cover"
        />
      )}

      <div aria-hidden className="absolute inset-x-0 bottom-0 h-3/5 bg-linear-to-t from-ink/70 via-ink/25 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-6 pb-12 text-center md:pb-14">
        <p className="caps text-[12px] text-cream/85 [overflow-wrap:anywhere] md:text-[13px]">{textOr(o?.eyebrow, locale, t("eyebrow"))}</p>
        <h1
          id="hero-title"
          className="caps mt-3 max-w-4xl font-serif text-[30px] leading-[1.08] font-medium text-balance [overflow-wrap:anywhere] md:text-[40px] lg:text-[46px]"
        >
          {textOr(o?.title, locale, t("title"))}
        </h1>
        <Button asChild variant="light" className="mt-6 min-w-44 md:mt-7">
          <Link href={href}>{textOr(o?.cta, locale, t("cta"))}</Link>
        </Button>
      </div>
    </section>
  );
}
