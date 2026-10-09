"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { safeJSONStorage } from "@/lib/storage";
import type { Order } from "@/store/checkout";

// Back-office state: which orders are fulfilled, plus the generated sample orders. The customer's
// ms-checkout store is never touched (its migrate drops unpaid orders on any version change, and a
// stale store tab could overwrite it). The sample generator is imported lazily so the storefront
// bundles never pull it in.

export type FulfillmentMap = Record<string, { doneAt: string }>;

type AdminState = {
  /** orderId → when it was marked done. Covers both sample and real orders. */
  fulfillment: FulfillmentMap;
  /** The generated demo orders (empty once cleared). */
  samples: Order[];
  samplesSeededAt: string | null;
  samplesCleared: boolean;

  markDone: (ids: string[], nowIso: string) => void;
  markPending: (ids: string[]) => void;
  /** Generates the sample orders once. No-op if already seeded or explicitly cleared. */
  seedSamples: (nowIso: string) => void;
  clearSamples: () => void;
  restoreSamples: (nowIso: string) => void;
  resetAll: () => void;
};

const EMPTY_STATE = {
  fulfillment: {} as FulfillmentMap,
  samples: [] as Order[],
  samplesSeededAt: null as string | null,
  samplesCleared: false,
};

const toDoneEntries = (done: Record<string, string>): FulfillmentMap =>
  Object.fromEntries(Object.entries(done).map(([id, doneAt]) => [id, { doneAt }]));

export const useAdminStore = create<AdminState>()(
  persist(
    (set, get) => ({
      ...EMPTY_STATE,

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

      seedSamples: (nowIso) => {
        if (get().samplesSeededAt || get().samplesCleared) return;
        void import("@/lib/admin/samples").then(({ generateSampleOrders }) => {
          const current = get();
          if (current.samplesSeededAt || current.samplesCleared) return;
          const { orders, done } = generateSampleOrders(new Date(nowIso));
          set({
            samples: orders,
            samplesSeededAt: nowIso,
            fulfillment: { ...current.fulfillment, ...toDoneEntries(done) },
          });
        });
      },

      clearSamples: () => {
        const current = get();
        const sampleIds = new Set(current.samples.map((o) => o.id));
        const fulfillment = Object.fromEntries(
          Object.entries(current.fulfillment).filter(([id]) => !sampleIds.has(id)),
        );
        set({ samples: [], fulfillment, samplesCleared: true });
      },

      restoreSamples: (nowIso) => {
        void import("@/lib/admin/samples").then(({ generateSampleOrders }) => {
          const current = get();
          const { orders, done } = generateSampleOrders(new Date(nowIso));
          set({
            samples: orders,
            samplesSeededAt: nowIso,
            samplesCleared: false,
            fulfillment: { ...current.fulfillment, ...toDoneEntries(done) },
          });
        });
      },

      // Writes the empty state (never removeItem, so a stale tab can't resurrect old data).
      resetAll: () => set({ ...EMPTY_STATE }),
    }),
    {
      name: "ms-admin",
      version: 1,
      storage: safeJSONStorage,
      partialize: (s) => ({
        fulfillment: s.fulfillment,
        samples: s.samples,
        samplesSeededAt: s.samplesSeededAt,
        samplesCleared: s.samplesCleared,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AdminState>;
        return {
          ...current,
          fulfillment: p.fulfillment && typeof p.fulfillment === "object" ? p.fulfillment : {},
          samples: Array.isArray(p.samples) ? p.samples : [],
          samplesSeededAt: typeof p.samplesSeededAt === "string" ? p.samplesSeededAt : null,
          samplesCleared: p.samplesCleared === true,
        };
      },
    },
  ),
);
