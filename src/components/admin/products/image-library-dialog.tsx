"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import media from "@/data/media.generated.json";
import { cn } from "@/lib/cn";

const LIBRARY_KEYS = Object.keys(media as Record<string, unknown>).sort();

/**
 * Picks one or more of the site's built-in photos (the generated media manifest) to add to a
 * product's gallery. Photos already in the gallery, or beyond the remaining slots, can't be
 * chosen.
 */
export function ImageLibraryDialog({
  open,
  onOpenChange,
  existing,
  remaining,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: string[];
  remaining: number;
  onAdd: (keys: string[]) => void;
}) {
  const t = useTranslations("admin");
  const [selected, setSelected] = useState<string[]>([]);
  const inGallery = new Set(existing);

  const close = (next: boolean) => {
    if (!next) setSelected([]);
    onOpenChange(next);
  };

  const toggle = (key: string) => {
    setSelected((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= remaining) return prev;
      return [...prev, key];
    });
  };

  const commit = () => {
    if (selected.length === 0) return;
    onAdd(selected);
    setSelected([]);
    onOpenChange(false);
  };

  return (
    <Modal open={open} onOpenChange={close} title={t("editor.library.title")} className="sm:max-w-2xl">
      <div className="px-6 pt-3 pb-4">
        <p className="text-[13px] leading-snug text-muted">
          {t("editor.library.intro", { remaining })}
        </p>
      </div>
      <div className="max-h-[60vh] overflow-y-auto px-6">
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {LIBRARY_KEYS.map((key) => {
            const added = inGallery.has(key);
            const isSelected = selected.includes(key);
            const disabled = added || (!isSelected && selected.length >= remaining);
            return (
              <li key={key}>
                <button
                  type="button"
                  disabled={disabled}
                  aria-pressed={isSelected}
                  onClick={() => toggle(key)}
                  data-testid="library-item"
                  className={cn(
                    "group relative block aspect-square w-full overflow-hidden border bg-tile transition-colors",
                    isSelected ? "border-racing" : "border-line hover:border-ink",
                    disabled && !added && "cursor-not-allowed opacity-40",
                    added && "cursor-not-allowed opacity-50",
                  )}
                >
                  <ResponsiveImage image={key} alt="" sizes="160px" />
                  {isSelected && (
                    <span className="absolute inset-0 flex items-center justify-center bg-racing/25">
                      <Check className="size-6 text-cream" strokeWidth={2} aria-hidden />
                    </span>
                  )}
                  {added && (
                    <span className="caps absolute inset-x-0 bottom-0 bg-ink/70 py-0.5 text-center text-[10px] text-cream">
                      {t("editor.library.added")}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="safe-bottom flex justify-end gap-3 px-6 py-4">
        <Button variant="secondary" size="sm" onClick={() => close(false)}>
          {t("editor.cancel")}
        </Button>
        <Button size="sm" onClick={commit} disabled={selected.length === 0} data-testid="library-add">
          {t("editor.library.add", { count: selected.length })}
        </Button>
      </div>
    </Modal>
  );
}
