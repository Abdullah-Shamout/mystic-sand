"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { safeJSONStorage } from "@/lib/storage";

// Back-office state: which orders are fulfilled (marked done). Orders themselves are
// server-authoritative (read from Postgres by the admin dashboard / analysis); this store only holds
// the per-admin fulfilment flags, keyed by order id. The customer's ms-checkout store is never
// touched. The demo sample-order machinery was retired in Phase 7 (src/lib/admin/samples.ts is gone).

export type FulfillmentMap = Record<string, { doneAt: string }>;

type AdminState = {
  /** orderId → when it was marked done. */
  fulfillment: FulfillmentMap;

  markDone: (ids: string[], nowIso: string) => void;
  markPending: (ids: string[]) => void;
  resetAll: () => void;
};

const readFulfillment = (p: Partial<AdminState> | undefined): FulfillmentMap =>
  p?.fulfillment && typeof p.fulfillment === "object" ? p.fulfillment : {};

export const useAdminStore = create<AdminState>()(
  persist(
    (set, get) => ({
      fulfillment: {},

      markDone: (ids, nowIso) => {
        const fulfillment = { ...get().fulfillment };
        for (const id of ids) if (!fulfillment[id]) fulfillment[id] = { doneAt: nowIso };
        set({ fulfillment });
      },

      markPending: (ids) => {
        const fulfillment = { ...get().fulfillment };
        for (const id of ids) delete fulfillment[id];
        set({ fulfillment });
      },

      resetAll: () => set({ fulfillment: {} }),
    }),
    {
      name: "ms-admin",
      version: 2,
      storage: safeJSONStorage,
      partialize: (s) => ({ fulfillment: s.fulfillment }),
      // v1 also persisted the demo sample orders (samples / samplesSeededAt / samplesVersion /
      // samplesCleared). Those are gone (Phase 7); keep only the fulfilment map — its done flags are
      // keyed by order id and stay valid for the real DB orders (sample ids simply match nothing).
      migrate: (persisted) => ({ fulfillment: readFulfillment(persisted as Partial<AdminState>) }),
      merge: (persisted, current) => ({
        ...current,
        fulfillment: readFulfillment(persisted as Partial<AdminState>),
      }),
    },
  ),
);
