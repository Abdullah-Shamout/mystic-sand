"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { cleanHome, type HomeOverrides, type HomeSection } from "@/lib/home";
import { safeJSONStorage } from "@/lib/storage";

type HomeState = {
  /** Only the sections/fields the admin has changed; everything else falls back to the built-ins. */
  overrides: HomeOverrides;
  /** Replaces one section (undefined clears it); the whole set is re-sanitised on every write. */
  saveSection: (section: HomeSection, value: HomeOverrides[HomeSection] | undefined) => void;
  resetSection: (section: HomeSection) => void;
  /** Writes an empty set (never removeItem, so other tabs see the change via a storage event). */
  resetAll: () => void;
};

export const useHomeStore = create<HomeState>()(
  persist(
    (set, get) => ({
      overrides: {},

      saveSection: (section, value) => set({ overrides: cleanHome({ ...get().overrides, [section]: value }) }),

      resetSection: (section) => {
        const overrides = { ...get().overrides };
        delete overrides[section];
        set({ overrides: cleanHome(overrides) });
      },

      resetAll: () => set({ overrides: {} }),
    }),
    {
      name: "ms-home",
      version: 1,
      storage: safeJSONStorage,
      partialize: (s) => ({ overrides: s.overrides }),
      // Sanitise a state saved by any version so a version bump never logs "couldn't be migrated".
      migrate: (persisted) => ({ overrides: cleanHome((persisted as { overrides?: unknown })?.overrides) }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as { overrides?: unknown };
        return { ...current, overrides: cleanHome(p?.overrides) };
      },
    },
  ),
);
