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

/** A persisted overrides value is only kept when it is a plain object; resolveSettings validates fields. */
const coerceOverrides = (value: unknown): Partial<StoreSettings> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<StoreSettings>) : {};

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
      // Coerce a state saved by any version so a version bump never logs "couldn't be migrated".
      migrate: (persisted) => ({ overrides: coerceOverrides((persisted as { overrides?: unknown })?.overrides) }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as { overrides?: unknown };
        return { ...current, overrides: coerceOverrides(p.overrides) };
      },
    },
  ),
);
