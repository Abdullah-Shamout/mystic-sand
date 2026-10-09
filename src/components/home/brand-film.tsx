"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { Link } from "@/i18n/navigation";
import { asset } from "@/lib/asset";
import { useReducedMotion } from "@/lib/hooks";

type Props = {
  /** Id of the heading (the section is labelled by it). */
  id?: string;
  eyebrow: string;
  title: string;
  body: string;
  cta?: { href: string; label: string };
};

/**
 * The 9:16 brand film beside its text. Like the hero it plays muted on a loop with no
 * controls (the client's choice). Nothing downloads until the film nears the screen;
 * it plays while in view and rests once scrolled away. Reduced motion keeps the poster.
 */
export function BrandFilm({ id = "brand-film", eyebrow, title, body, cta }: Props) {
  const t = useTranslations("home.film");
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduced = useReducedMotion();

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
    <section aria-labelledby={id} className="bg-ink text-cream [&_:focus-visible]:outline-cream">
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
          <p className="caps text-[12px] text-cream/70 md:text-[13px]">{eyebrow}</p>
          <h2 id={id} className="caps mt-3 font-serif text-title-sm font-medium md:text-title">
            {title}
          </h2>
          <p className="mx-auto mt-5 max-w-md text-[16px] leading-[1.8] text-cream/80 md:mx-0">{body}</p>
          {cta && (
            <Button asChild variant="outline-light" className="mt-8">
              <Link href={cta.href}>{cta.label}</Link>
            </Button>
          )}
        </Reveal>
      </div>
    </section>
  );
}
