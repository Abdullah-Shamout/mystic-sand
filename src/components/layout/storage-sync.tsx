"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { STORAGE_FULL_EVENT } from "@/lib/storage";
import { clearUploadCache } from "@/lib/uploads";
import { useBag } from "@/store/bag";
import { useCatalogStore } from "@/store/catalog";
import { useCheckout } from "@/store/checkout";
import { useSettingsStore } from "@/store/settings";
import { useUi } from "@/store/ui";

// Keeps this tab in step with edits made in another tab (the admin saving while the store is
// open elsewhere), and turns a full-storage event into a toast. Mounted once, in Providers.
const PERSISTED = {
  "ms-bag": useBag,
  "ms-checkout": useCheckout,
  "ms-catalog": useCatalogStore,
  "ms-settings": useSettingsStore,
} as const;

export function StorageSync() {
  const t = useTranslations("common");
  const pushToast = useUi((s) => s.pushToast);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null) {
        // Whole store cleared: rehydrate everything and drop the upload cache.
        Object.values(PERSISTED).forEach((store) => void store.persist.rehydrate());
        clearUploadCache();
        return;
      }
      if (e.key.startsWith("ms-img:")) {
        clearUploadCache();
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
