"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useRef } from "react";
import type { Locale } from "@/i18n/routing";
import type { Product, Variant } from "@/data/types";
import { maxQtyFor, useBag } from "@/store/bag";
import { useUi } from "@/store/ui";

/**
 * Shared add-to-bag behaviour.
 *  - Product grids / search (default): non-blocking toast with "View bag" / "Checkout";
 *    focus stays on the card.
 *  - Product page "Add to bag": `openDrawer: true` opens the bag drawer (Amouage behaviour).
 * Rapid double taps within 600ms are ignored, so a double tap still means qty 1.
 */
export function useAddToBag() {
  const add = useBag((s) => s.add);
  const openBag = useUi((s) => s.openBag);
  const pushToast = useUi((s) => s.pushToast);
  const announce = useUi((s) => s.announce);
  const t = useTranslations("common");
  const locale = useLocale() as Locale;
  const last = useRef<{ sku: string; at: number } | null>(null);

  return useCallback(
    (product: Product, variant: Variant, options: { qty?: number; openDrawer?: boolean } = {}) => {
      const now = performance.now();
      if (last.current && last.current.sku === variant.sku && now - last.current.at < 600) return;
      last.current = { sku: variant.sku, at: now };

      const { capped } = add(variant.sku, options.qty ?? 1);
      announce(t("bag.addedAnnounce", { name: product.name }));

      if (capped) {
        pushToast({ title: t("bag.maxReached", { max: maxQtyFor(variant.sku) }) });
      }
      if (options.openDrawer) {
        openBag();
        return;
      }
      pushToast({
        title: t("bag.added"),
        description: `${product.name} · ${variant.size[locale]}`,
        image: product.images.card,
        actions: [
          { label: t("bag.viewBag"), onClick: openBag },
          { label: t("bag.checkout"), href: "/checkout", primary: true },
        ],
      });
    },
    [add, announce, locale, openBag, pushToast, t],
  );
}
