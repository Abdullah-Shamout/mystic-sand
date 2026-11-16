"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { STORAGE_FULL_EVENT } from "@/lib/storage";
import { useBag } from "@/store/bag";
import { useCheckout } from "@/store/checkout";
import { useStockStore } from "@/store/stock";
import { useUi } from "@/store/ui";

// Keeps this tab's browser-persisted stores in step with another tab, and turns a full-storage event
// into a toast. Mounted once, in Providers. The catalog, settings and the home-page CMS live in the
// DB now (saved via the catalog / settings / home Server Actions), so there is no ms-catalog,
// ms-settings or ms-home store to sync, and uploaded images are served from the server, so there is
// no ms-img cache to drop.
const PERSISTED = {
  "ms-bag": useBag,
  "ms-checkout": useCheckout,
  "ms-stock": useStockStore,
} as const;

// The admin store is loaded lazily so storefront pages never statically import it (nor the
// sample generator it reaches). It is only touched when an ms-admin storage event actually fires.
const rehydrateAdmin = () => void import("@/store/admin").then((m) => m.useAdminStore.persist.rehydrate());

export function StorageSync() {
  const t = useTranslations("common");
  const pushToast = useUi((s) => s.pushToast);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null) {
        // Whole store cleared: rehydrate everything.
        Object.values(PERSISTED).forEach((store) => void store.persist.rehydrate());
        rehydrateAdmin();
        return;
      }
      if (e.key === "ms-admin") {
        rehydrateAdmin();
        return;
      }
      const store = PERSISTED[e.key as keyof typeof PERSISTED];
      if (store) void store.persist.rehydrate();
    };
    const onFull = () => pushToast({ title: t("storageFull") });

    window.addEventListener("storage", onStorage);
    window.addEventListener(STORAGE_FULL_EVENT, onFull);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(STORAGE_FULL_EVENT, onFull);
    };
  }, [pushToast, t]);

  return null;
}
