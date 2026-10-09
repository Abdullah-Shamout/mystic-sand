"use client";

import { Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { Link } from "@/i18n/navigation";
import { asset } from "@/lib/asset";
import { cn } from "@/lib/cn";

type Status = "idle" | "playing" | "paused" | "ended";

type Props = {
  /** Id of the heading (the section is labelled by it). */
  id?: string;
  eyebrow: string;
  title: string;
  body: string;
  cta?: { href: string; label: string };
};

/**
 * The 9:16 brand film (with sound) beside its text. It never autoplays: the large play
 * button starts it with sound — a user gesture — and pause/mute controls follow. It also
 * pauses once scrolled out of view, so the sound never follows the reader down the page.
 */
export function BrandFilm({ id = "brand-film", eyebrow, title, body, cta }: Props) {
  const t = useTranslations("home.film");
  const videoRef = useRef<HTMLVideoElement>(null);
  const pauseRef = useRef<HTMLButtonElement>(null);
  const focusControls = useRef(false);
  const [status, setStatus] = useState<Status>("idle");
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio < 0.25 && !video.paused) video.pause();
      },
      { threshold: [0, 0.25] },
    );
    io.observe(video);
    return () => io.disconnect();
  }, []);

  // The big play button disappears once playing; keep keyboard focus in the controls.
  useEffect(() => {
    if (status === "playing" && focusControls.current) {
      focusControls.current = false;
      pauseRef.current?.focus();
    }
  }, [status]);

  const play = () => {
    const video = videoRef.current;
    if (!video) return;
    if (status === "idle") video.muted = false;
    video.play().catch(() => {
      // A browser may still refuse sound; fall back to muted playback.
      video.muted = true;
      video.play().catch(() => {});
    });
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) play();
    else video.pause();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (video) video.muted = !video.muted;
  };

  const overlayLabel = status === "ended" ? t("replay") : status === "paused" ? t("resume") : t("playWithSound");

  return (
    <section aria-labelledby={id} className="bg-ink text-cream [&_:focus-visible]:outline-cream">
      <div className="mx-auto grid max-w-[1200px] items-center md:grid-cols-2 md:gap-12 md:px-10 md:py-20 lg:gap-20">
        <div className="relative mx-auto aspect-[9/16] max-h-[calc(100svh-65px)] w-full max-w-full overflow-hidden bg-ink md:max-h-none md:w-[min(440px,calc((100svh_-_200px)*9/16))]">
          <video
            ref={videoRef}
            src={asset("/videos/film.mp4")}
            poster={asset("/videos/film-poster.webp")}
            preload="none"
            playsInline
            disablePictureInPicture
            aria-label={t("videoLabel")}
            onPlay={() => setStatus("playing")}
            onPause={(e) => setStatus(e.currentTarget.ended ? "ended" : "paused")}
            onEnded={() => setStatus("ended")}
            onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              setProgress(v.duration ? v.currentTime / v.duration : 0);
            }}
            onClick={togglePlay}
            className="absolute inset-0 size-full object-cover"
          />

          {status !== "playing" && (
            <button
              type="button"
              onClick={() => {
                focusControls.current = true;
                play();
              }}
              // Sits in the dark lower third of the poster, clear of the bottles' labels.
              className="group absolute inset-0 flex flex-col items-center justify-end gap-4 bg-ink/15 pb-[11%] transition-colors duration-300 hover:bg-ink/30"
            >
              <span
                aria-hidden
                className="flex size-20 items-center justify-center border border-cream/80 bg-ink/35 backdrop-blur-sm transition-colors duration-300 group-hover:bg-cream group-hover:text-ink"
              >
                {status === "ended" ? (
                  <RotateCcw className="size-6" strokeWidth={1.25} />
                ) : (
                  <Play className="size-7 translate-x-0.5" strokeWidth={1.25} />
                )}
              </span>
              <span className="caps text-[12px] text-cream md:text-[13px]">{overlayLabel}</span>
            </button>
          )}

          <div
            className={cn(
              "absolute inset-x-0 bottom-0 z-10 flex justify-end gap-1 bg-linear-to-t from-ink/60 to-transparent px-2 pt-12 pb-3",
              status === "idle" && "invisible",
            )}
          >
            <button
              ref={pauseRef}
              type="button"
              onClick={togglePlay}
              aria-label={status === "playing" ? t("pause") : t("resume")}
              className="inline-flex size-11 items-center justify-center transition-opacity hover:opacity-75"
            >
              {status === "playing" ? (
                <Pause className="size-5" strokeWidth={1.25} aria-hidden />
              ) : (
                <Play className="size-5" strokeWidth={1.25} aria-hidden />
              )}
            </button>
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? t("unmute") : t("mute")}
              className="inline-flex size-11 items-center justify-center transition-opacity hover:opacity-75"
            >
              {muted ? (
                <VolumeX className="size-5" strokeWidth={1.25} aria-hidden />
              ) : (
                <Volume2 className="size-5" strokeWidth={1.25} aria-hidden />
              )}
            </button>
          </div>
          <div aria-hidden className={cn("absolute inset-x-0 bottom-0 z-10 h-0.5 bg-cream/20", status === "idle" && "invisible")}>
            <div
              className="h-full origin-left bg-cream rtl:origin-right"
              style={{ transform: `scaleX(${progress})` }}
            />
          </div>
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
