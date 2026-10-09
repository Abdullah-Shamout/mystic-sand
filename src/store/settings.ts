"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { StoreSettings } from "@/lib/settings";
import { safeJSONStorage } from "@/lib/storage";

type SettingsState = {
  /** Only the fields the admin has changed; everything else falls back to defaultSettings. */
  overrides: Partial<StoreSettings>;
  setOverrides: (partial: Partial<StoreSettings>) => void;
  resetField: (key: keyof StoreSettings) => void;
  resetAll: () => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      overrides: {},

      setOverrides: (partial) => set({ overrides: { ...get().overrides, ...partial } }),

      resetField: (key) => {
        const overrides = { ...get().overrides };
        delete overrides[key];
        set({ overrides });
      },

      resetAll: () => set({ overrides: {} }),
    }),
    {
      name: "ms-settings",
      version: 1,
      storage: safeJSONStorage,
      partialize: (s) => ({ overrides: s.overrides }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as { overrides?: unknown };
        const overrides =
          p.overrides && typeof p.overrides === "object" && !Array.isArray(p.overrides)
            ? (p.overrides as Partial<StoreSettings>)
            : {};
        return { ...current, overrides };
      },
    },
  ),
);
