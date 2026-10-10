"use client";

import { Check, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import media from "@/data/media.generated.json";
import { cn } from "@/lib/cn";
import { useLiveCatalog } from "@/lib/live";
import { deleteUpload, listUploadIds, UPLOAD_PREFIX, uploadIdFromKey } from "@/lib/uploads";
import { ConfirmDialog } from "../confirm-dialog";

const LIBRARY_KEYS = Object.keys(media as Record<string, unknown>).sort();

/**
 * Picks one or more photos to add to a product's gallery — from the site's built-in photos AND
 * every photo uploaded to any product (a reusable library). Uploaded photos can be deleted from
 * here (with a confirm, warning when a product still uses one). Photos already in the gallery, or
 * beyond the remaining slots, can't be chosen.
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
  const catalog = useLiveCatalog();
  const [selected, setSelected] = useState<string[]>([]);
  const [tick, setTick] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const inGallery = new Set(existing);

  // Read the uploads each time the dialog is opened (and after a delete), so a photo uploaded to
  // another product shows up here.
  const uploadKeys = useMemo(() => {
    void tick;
    if (!open) return [];
    return listUploadIds().map((id) => `${UPLOAD_PREFIX}${id}`);
  }, [open, tick]);

  const usageCount = (key: string) =>
    catalog.products.filter((p) => [p.images.card, p.images.hover, ...p.images.gallery].includes(key)).length;

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

  const confirmDelete = () => {
    if (!pendingDelete) return;
    deleteUpload(uploadIdFromKey(pendingDelete));
    setSelected((prev) => prev.filter((k) => k !== pendingDelete));
    setPendingDelete(null);
    setTick((n) => n + 1);
  };

  const renderThumb = (imgKey: string, deletable: boolean) => {
    const added = inGallery.has(imgKey);
    const isSelected = selected.includes(imgKey);
    const disabled = added || (!isSelected && selected.length >= remaining);
    return (
      <li key={imgKey} className="relative">
        <button
          type="button"
          disabled={disabled}
          aria-pressed={isSelected}
          onClick={() => toggle(imgKey)}
          data-testid={deletable ? "library-upload-item" : "library-item"}
          className={cn(
            "group relative block aspect-square w-full overflow-hidden border bg-tile transition-colors",
            isSelected ? "border-racing" : "border-line hover:border-ink",
            disabled && !added && "cursor-not-allowed opacity-40",
            added && "cursor-not-allowed opacity-50",
          )}
        >
          <ResponsiveImage image={imgKey} alt="" sizes="160px" />
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
        {deletable && (
          <button
            type="button"
            onClick={() => setPendingDelete(imgKey)}
            aria-label={t("editor.library.delete")}
            data-testid="library-upload-delete"
            className="absolute end-1 top-1 inline-flex size-7 items-center justify-center bg-paper/90 text-muted transition-colors hover:text-danger"
          >
            <Trash2 className="size-3.5" strokeWidth={1.5} aria-hidden />
          </button>
        )}
      </li>
    );
  };

  return (
    <>
      <Modal open={open} onOpenChange={close} title={t("editor.library.title")} className="sm:max-w-2xl">
        <div className="px-6 pt-3 pb-4">
          <p className="text-[13px] leading-snug text-muted">{t("editor.library.intro", { remaining })}</p>
        </div>
        <div className="max-h-[60vh] space-y-6 overflow-y-auto px-6">
          <section>
            <h3 className="caps mb-2 text-[12px] font-medium text-muted">{t("editor.library.uploadsGroup")}</h3>
            {uploadKeys.length === 0 ? (
              <p className="text-[13px] text-muted">{t("editor.library.uploadsEmpty")}</p>
            ) : (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="library-uploads">
                {uploadKeys.map((key) => renderThumb(key, true))}
              </ul>
            )}
          </section>
          <section>
            <h3 className="caps mb-2 text-[12px] font-medium text-muted">{t("editor.library.siteGroup")}</h3>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {LIBRARY_KEYS.map((key) => renderThumb(key, false))}
            </ul>
          </section>
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

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => !next && setPendingDelete(null)}
        title={t("editor.library.deleteConfirmTitle")}
        message={
          pendingDelete && usageCount(pendingDelete) > 0
            ? `${t("editor.library.deleteConfirmMessage")} ${t("editor.library.deleteConfirmInUse", { count: usageCount(pendingDelete) })}`
            : t("editor.library.deleteConfirmMessage")
        }
        confirmLabel={t("editor.library.deleteConfirm")}
        danger
        onConfirm={confirmDelete}
      />
    </>
  );
}
