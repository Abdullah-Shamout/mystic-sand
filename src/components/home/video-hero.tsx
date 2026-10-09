"use client";

import { Pause, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { asset } from "@/lib/asset";
import { useMediaQuery, useMounted, useReducedMotion } from "@/lib/hooks";

const DESKTOP = { src: "/videos/hero-desktop.mp4", poster: "/videos/hero-desktop-poster.webp" };
const MOBILE = { src: "/videos/hero-mobile.mp4", poster: "/videos/hero-mobile-poster.webp" };

/**
 * Full-bleed hero (height = viewport minus ticker and header). The static HTML shows
 * the art-directed posters; after mount ONE source is chosen for the screen size, so
 * only one file downloads. Reduced motion keeps the poster. The pause toggle satisfies
 * WCAG 2.2.2, and the loop also pauses while the hero is scrolled out of view.
 */
export function VideoHero() {
  const t = useTranslations("home.hero");
  const mounted = useMounted();
  const desktop = useMediaQuery("(min-width: 768px)");
  const reduced = useReducedMotion();
  const source = mounted && !reduced ? (desktop ? DESKTOP : MOBILE) : null;

  const videoRef = useRef<HTMLVideoElement>(null);
  const userPaused = useRef(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // React does not reliably reflect `muted`; browsers only autoplay muted video.
    video.muted = true;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) video.pause();
      else if (!userPaused.current) video.play().catch(() => {});
    });
    io.observe(video);
    return () => io.disconnect();
  }, [source]);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      userPaused.current = false;
      video.play().catch(() => {});
    } else {
      userPaused.current = true;
      video.pause();
    }
  };

  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate h-[calc(100svh-105px)] min-h-[520px] overflow-hidden bg-ink text-cream lg:h-[calc(100svh-177px)] [&_:focus-visible]:outline-cream"
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
          aria-hidden
          tabIndex={-1}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          className="absolute inset-0 size-full object-cover"
        />
      )}

      <div aria-hidden className="absolute inset-x-0 bottom-0 h-3/5 bg-linear-to-t from-ink/70 via-ink/25 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-6 pb-12 text-center md:pb-14">
        <p className="caps text-[12px] text-cream/85 md:text-[13px]">{t("eyebrow")}</p>
        <h1
          id="hero-title"
          className="caps mt-3 max-w-4xl font-serif text-[30px] leading-[1.08] font-medium text-balance md:text-[40px] lg:text-[46px]"
        >
          {t("title")}
        </h1>
        <Button asChild variant="light" className="mt-6 min-w-44 md:mt-7">
          <Link href="/shop/eau-de-parfum">{t("cta")}</Link>
        </Button>
      </div>

      {source && (
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? t("pause") : t("play")}
          className="absolute end-3 bottom-3 z-10 inline-flex size-11 items-center justify-center bg-ink/25 text-cream transition-colors hover:bg-ink/50 md:end-6 md:bottom-6"
        >
          {playing ? (
            <Pause className="size-4" strokeWidth={1.5} aria-hidden />
          ) : (
            <Play className="size-4" strokeWidth={1.5} aria-hidden />
          )}
        </button>
      )}
    </section>
  );
}
