"use client";

import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { cn } from "@/lib/cn";
import { ProductLightbox } from "./product-lightbox";

const arrow =
  "absolute top-1/2 z-10 inline-flex size-11 -translate-y-1/2 items-center justify-center border border-ink/15 bg-paper/85 text-ink transition-colors duration-150 hover:bg-paper lg:size-12";

/**
 * One image at a time, starting with the first: previous / next arrows, swipe on touch
 * screens and the arrow keys move through the rest (looping round). Embla handles the
 * slide and the reading direction, so in Arabic "next" sits on the left. On desktop the
 * square never grows taller than the window. Every image opens the lightbox.
 */
export function ProductGallery({ images, name }: { images: string[]; name: string }) {
  const t = useTranslations("product.gallery");
  const locale = useLocale();
  const total = images.length;
  const [viewportRef, embla] = useEmblaCarousel({
    direction: locale === "ar" ? "rtl" : "ltr",
    loop: total > 1,
    duration: 22,
  });
  const [selected, setSelected] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const position = (i: number) => ({ index: String(i + 1), total: String(total) });

  useEffect(() => {
    if (!embla) return;
    const sync = () => setSelected(embla.selectedScrollSnap());
    embla.on("select", sync).on("reInit", sync);
    return () => {
      embla.off("select", sync).off("reInit", sync);
    };
  }, [embla]);

  // Paging inside the lightbox moves the gallery too, so closing it shows the same image.
  const showInLightbox = (index: number | null) => {
    if (index !== null) embla?.scrollTo(index, true);
    setLightbox(index);
  };

  const focusSelected = () => {
    if (!embla) return;
    embla.slideNodes()[embla.selectedScrollSnap()]?.querySelector("button")?.focus({ preventScroll: true });
  };

  return (
    <div
      role="region"
      aria-label={t("label", { name })}
      className="relative lg:mx-auto lg:w-[min(100%,max(440px,calc(100svh-129px)))]"
      onKeyDown={(e) => {
        if (!embla || total < 2 || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
        e.preventDefault();
        const forward = (e.key === "ArrowRight") !== (locale === "ar");
        const onImage = embla.slideNodes().some((slide) => slide.contains(document.activeElement));
        if (forward) embla.scrollNext();
        else embla.scrollPrev();
        // The image left behind is hidden from assistive tech: keep focus on the one showing.
        if (onImage) focusSelected();
      }}
    >
      <div ref={viewportRef} className="overflow-hidden">
        <div className="flex touch-pan-y touch-pinch-zoom">
          {images.map((image, i) => (
            <div
              key={`${image}-${i}`}
              role="group"
              aria-label={t("position", position(i))}
              aria-hidden={i !== selected}
              className="min-w-0 shrink-0 grow-0 basis-full"
            >
              <button
                type="button"
                onClick={() => setLightbox(i)}
                tabIndex={i === selected ? 0 : -1}
                aria-label={t("enlarge", position(i))}
                className="group relative block aspect-square w-full cursor-zoom-in overflow-hidden bg-tile"
              >
                <ResponsiveImage
                  image={image}
                  alt={name}
                  sizes="(min-width: 1024px) 58vw, 100vw"
                  priority={i === 0}
                  className="transition-transform duration-500 ease-[var(--ease-soft)] group-hover:scale-[1.03]"
                />
                <span
                  aria-hidden
                  className="absolute end-3 bottom-3 inline-flex size-11 items-center justify-center border border-ink/15 bg-paper/85 text-ink transition-colors duration-150 group-hover:bg-paper lg:end-5 lg:bottom-5"
                >
                  <Plus className="size-4" strokeWidth={1.25} />
                </span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {total > 1 && (
        <>
          {/* Disabled until the carousel is ready, so an early tap is never lost. */}
          <button
            type="button"
            onClick={() => embla?.scrollPrev()}
            disabled={!embla}
            aria-label={t("previous")}
            className={cn(arrow, "start-3 lg:start-5")}
            data-testid="gallery-previous"
          >
            <ChevronLeft className="size-5 rtl:-scale-x-100" strokeWidth={1.25} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => embla?.scrollNext()}
            disabled={!embla}
            aria-label={t("next")}
            className={cn(arrow, "end-3 lg:end-5")}
            data-testid="gallery-next"
          >
            <ChevronRight className="size-5 rtl:-scale-x-100" strokeWidth={1.25} aria-hidden />
          </button>
          <p className="figures pointer-events-none absolute start-3 bottom-3 bg-paper/85 px-2.5 text-[12px] leading-7 text-ink lg:start-5 lg:bottom-5">
            {/* LTR inside, so Arabic shows "1 / 5" (not "5 / 1"); the box itself stays at the start edge. */}
            <span aria-hidden dir="ltr" data-testid="gallery-counter">
              {selected + 1} / {total}
            </span>
            <span className="sr-only" aria-live="polite">
              {t("position", position(selected))}
            </span>
          </p>
        </>
      )}

      <ProductLightbox
        images={images}
        name={name}
        index={lightbox}
        onIndexChange={showInLightbox}
        onCloseAutoFocus={(e) => {
          // Back to the image now showing, not the one first opened.
          e.preventDefault();
          focusSelected();
        }}
      />
    </div>
  );
}
