"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { safeJSONStorage } from "@/lib/storage";

// The stock ledger. There is no server: "available stock" for a SKU is the live catalog's stock
// value (what the admin set, via base data or an edit) MINUS the units sold since that value was
// last set. This store holds only the "sold since set" counter per SKU; the catalog holds the set
// value. Setting a SKU's stock (editor or Stock page) calls resetSold so available becomes exactly
// the typed value. Only orders PAID in this browser decrement stock; sample orders never do.

export type SoldMap = Record<string, number>;

type StockState = {
  /** sku → units sold (from PAID site orders) since the admin last set that SKU's stock. */
  sold: SoldMap;
  /** Adds the ordered quantity to each line's SKU. Called once per paid order. */
  recordSale: (lines: Array<{ sku: string; qty: number }>) => void;
  /** Clears the counter for one SKU — called whenever the admin sets that SKU's stock value. */
  resetSold: (sku: string) => void;
  resetAll: () => void;
};

const coerceSold = (value: unknown): SoldMap => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: SoldMap = {};
  for (const [sku, n] of Object.entries(value as Record<string, unknown>)) {
    if (typeof n === "number" && Number.isFinite(n) && n > 0) out[sku] = Math.floor(n);
  }
  return out;
};

export const useStockStore = create<StockState>()(
  persist(
    (set, get) => ({
      sold: {},

      recordSale: (lines) => {
        const sold = { ...get().sold };
        for (const line of lines) {
          const qty = Math.max(0, Math.floor(line.qty));
          if (qty > 0) sold[line.sku] = (sold[line.sku] ?? 0) + qty;
        }
        set({ sold });
      },

      resetSold: (sku) => {
        if (!(sku in get().sold)) return;
        const sold = { ...get().sold };
        delete sold[sku];
        set({ sold });
      },

      resetAll: () => set({ sold: {} }),
    }),
    {
      name: "ms-stock",
      version: 1,
      storage: safeJSONStorage,
      partialize: (s) => ({ sold: s.sold }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as { sold?: unknown };
        return { ...current, sold: coerceSold(p.sold) };
      },
    },
  ),
);
