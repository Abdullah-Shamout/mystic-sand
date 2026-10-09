"use client";

import useEmblaCarousel from "embla-carousel-react";
import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { ProductLightbox } from "./product-lightbox";

/**
 * One set of images, two layouts: below lg a swipeable peek carousel (Embla, RTL-aware)
 * with a "1 / 5" counter; from lg up Amouage's vertical stack of large squares, where
 * Embla switches itself off. Every image opens the lightbox.
 */
export function ProductGallery({ images, name }: { images: string[]; name: string }) {
  const t = useTranslations("product.gallery");
  const locale = useLocale();
  const [viewportRef, embla] = useEmblaCarousel({
    direction: locale === "ar" ? "rtl" : "ltr",
    align: "start",
    containScroll: "trimSnaps",
    breakpoints: { "(min-width: 1024px)": { active: false } },
  });
  const [selected, setSelected] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const total = images.length;

  useEffect(() => {
    if (!embla) return;
    const sync = () => setSelected(embla.selectedScrollSnap());
    embla.on("select", sync).on("reInit", sync);
    return () => {
      embla.off("select", sync).off("reInit", sync);
    };
  }, [embla]);

  return (
    <div className="relative">
      <div ref={viewportRef} role="region" aria-label={t("label", { name })} className="overflow-hidden lg:overflow-visible">
        <div className="-ms-1 flex touch-pan-y touch-pinch-zoom lg:ms-0 lg:flex-col lg:gap-1 lg:touch-auto">
          {images.map((image, i) => {
            const position = { index: String(i + 1), total: String(total) };
            return (
              <div
                key={`${image}-${i}`}
                role="group"
                aria-label={t("position", position)}
                className="min-w-0 shrink-0 grow-0 basis-[86%] ps-1 sm:basis-[60%] lg:basis-auto lg:ps-0"
              >
                <button
                  type="button"
                  onClick={() => setLightbox(i)}
                  aria-label={t("enlarge", position)}
                  className="group relative block aspect-square w-full cursor-zoom-in overflow-hidden bg-tile"
                >
                  <ResponsiveImage
                    image={image}
                    alt={name}
                    sizes="(min-width: 1024px) 58vw, (min-width: 640px) 60vw, 86vw"
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
            );
          })}
        </div>
      </div>
      {total > 1 && (
        <p
          aria-hidden
          className="figures pointer-events-none absolute start-3 bottom-3 bg-paper/85 px-2.5 text-[12px] leading-7 text-ink lg:hidden"
        >
          {/* LTR inside, so Arabic shows "1 / 5" (not "5 / 1"); the box itself stays at the start edge. */}
          <span dir="ltr">
            {selected + 1} / {total}
          </span>
        </p>
      )}
      <ProductLightbox images={images} name={name} index={lightbox} onIndexChange={setLightbox} />
    </div>
  );
}
