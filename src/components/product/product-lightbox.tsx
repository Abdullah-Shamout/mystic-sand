"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { ResponsiveImage } from "@/components/ui/responsive-image";

const arrow =
  "inline-flex size-11 items-center justify-center text-ink transition-opacity hover:opacity-60 disabled:opacity-30";

/**
 * Full-size view of the gallery ("+" on every image). Previous / next buttons and the
 * arrow keys follow the reading direction, so → means "next" in English and "previous"
 * in Arabic. A centred square on desktop, a bottom sheet on phones.
 */
export function ProductLightbox({
  images,
  name,
  index,
  onIndexChange,
}: {
  images: string[];
  name: string;
  index: number | null;
  onIndexChange: (index: number | null) => void;
}) {
  const t = useTranslations("product.gallery");
  const total = images.length;

  useEffect(() => {
    if (index === null || total < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const forward = (e.key === "ArrowRight") !== (document.documentElement.dir === "rtl");
      onIndexChange((index + (forward ? 1 : -1) + total) % total);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, total, onIndexChange]);

  const go = (step: number) => {
    if (index !== null) onIndexChange((index + step + total) % total);
  };

  return (
    <Modal
      open={index !== null}
      onOpenChange={(open) => !open && onIndexChange(null)}
      title={t("lightbox", { name })}
      hideTitle
      // Square image + the 64px control row, never taller than the dialog (86dvh).
      className="sm:w-[min(92vw,calc(86dvh_-_64px))]! sm:max-w-none!"
    >
      {index !== null && (
        <>
          <div className="relative aspect-square w-full bg-tile">
            <ResponsiveImage
              key={images[index]}
              image={images[index]}
              alt={t("position", { index: String(index + 1), total: String(total) })}
              sizes="(min-width: 640px) 86vh, 100vw"
              fit="contain"
              priority
            />
          </div>
          {total > 1 && (
            <div className="flex h-16 items-center justify-between px-3">
              <button type="button" onClick={() => go(-1)} className={arrow} aria-label={t("previous")}>
                <ChevronLeft className="size-5 rtl:-scale-x-100" strokeWidth={1.25} aria-hidden />
              </button>
              {/* The global live region is aria-hidden while a dialog is open, so this one is local. */}
              <p className="figures text-[14px]" aria-live="polite">
                <span aria-hidden dir="ltr">
                  {index + 1} / {total}
                </span>
                <span className="sr-only">{t("position", { index: String(index + 1), total: String(total) })}</span>
              </p>
              <button type="button" onClick={() => go(1)} className={arrow} aria-label={t("next")}>
                <ChevronRight className="size-5 rtl:-scale-x-100" strokeWidth={1.25} aria-hidden />
              </button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
