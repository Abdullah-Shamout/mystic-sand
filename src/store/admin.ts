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

// Bump when a new fixed built-in order is added to src/lib/admin/samples.ts. seedSamples then tops
// up admin browsers seeded at an older version with the missing built-in orders (without touching
// the random samples), unless the admin cleared the samples.
// v3: the fixed order moved from MS-20714 (inside the real-order range) to MS-19999 (reserved in the
// sample range); the top-up renames the legacy order and carries over any fulfilment.
export const SAMPLES_VERSION = 3;

type AdminState = {
  /** orderId → when it was marked done. Covers both sample and real orders. */
  fulfillment: FulfillmentMap;
  /** The generated demo orders (empty once cleared). */
  samples: Order[];
  samplesSeededAt: string | null;
  samplesCleared: boolean;
  /** The SAMPLES_VERSION the current samples were generated/topped-up at. */
  samplesVersion: number;

  markDone: (ids: string[], nowIso: string) => void;
  markPending: (ids: string[]) => void;
  /** Seeds the sample orders once, and tops up missing built-in orders on later versions. */
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
  samplesVersion: 0,
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
        const { samplesCleared, samplesSeededAt, samplesVersion } = get();
        if (samplesCleared) return; // the admin removed the samples on purpose
        if (samplesSeededAt && samplesVersion >= SAMPLES_VERSION) return; // already up to date
        void import("@/lib/admin/samples").then((m) => {
          const current = get();
          if (current.samplesCleared) return;
          if (current.samplesSeededAt && current.samplesVersion >= SAMPLES_VERSION) return;
          if (!current.samplesSeededAt) {
            // Fresh browser: generate the full set (random samples + built-in orders).
            const { orders, done } = m.generateSampleOrders(new Date(nowIso));
            set({
              samples: orders,
              samplesSeededAt: nowIso,
              samplesVersion: SAMPLES_VERSION,
              fulfillment: { ...current.fulfillment, ...toDoneEntries(done) },
            });
            return;
          }
          // Already seeded at an older version: drop any legacy-id copies of a built-in order
          // (carrying their fulfilment onto the new id), then add the built-in orders it is missing.
          const { orders, done } = m.fixedSampleOrders(new Date(nowIso));
          const newId = m.FIXED_ORDER_ID;
          const legacy = new Set<string>(m.LEGACY_FIXED_ORDER_IDS);

          const samples = current.samples.filter((o) => !legacy.has(o.id));
          const fulfillment = { ...current.fulfillment };
          for (const legacyId of m.LEGACY_FIXED_ORDER_IDS) {
            if (fulfillment[legacyId]) {
              if (!fulfillment[newId]) fulfillment[newId] = fulfillment[legacyId];
              delete fulfillment[legacyId];
            }
          }

          const existing = new Set(samples.map((o) => o.id));
          const missing = orders.filter((o) => !existing.has(o.id));
          set({
            samples: [...samples, ...missing],
            samplesVersion: SAMPLES_VERSION,
            fulfillment: { ...fulfillment, ...toDoneEntries(done) },
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
            samplesVersion: SAMPLES_VERSION,
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
        samplesVersion: s.samplesVersion,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AdminState>;
        return {
          ...current,
          fulfillment: p.fulfillment && typeof p.fulfillment === "object" ? p.fulfillment : {},
          samples: Array.isArray(p.samples) ? p.samples : [],
          samplesSeededAt: typeof p.samplesSeededAt === "string" ? p.samplesSeededAt : null,
          samplesCleared: p.samplesCleared === true,
          // Missing (older build) → 0, which triggers the built-in-order top-up on next seed.
          samplesVersion: typeof p.samplesVersion === "number" ? p.samplesVersion : 0,
        };
      },
    },
  ),
);
