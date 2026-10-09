"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { productBySku } from "@/data/products";
import { maxQtyPerLine, promoCodes } from "@/data/site";
import type { BagLine, Promo } from "@/lib/pricing";

export const maxQtyFor = (sku: string) => {
  const hit = productBySku(sku);
  return hit ? Math.min(hit.variant.stock, maxQtyPerLine) : 0;
};

type BagState = {
  lines: BagLine[];
  promo: Promo | null;
  /** Adds qty (default 1), capped by stock and the per-line limit. */
  add: (sku: string, qty?: number) => { qty: number; capped: boolean };
  /** Ensures the sku is in the bag without adding a second unit (Buy now). */
  ensure: (sku: string) => void;
  setQty: (sku: string, qty: number) => void;
  remove: (sku: string) => { line: BagLine; index: number } | null;
  restore: (line: BagLine, index: number) => void;
  clear: () => void;
  applyPromo: (code: string, now: Date) => "applied" | "invalid" | "expired";
  removePromo: () => void;
};

export const useBag = create<BagState>()(
  persist(
    (set, get) => ({
      lines: [],
      promo: null,

      add: (sku, qty = 1) => {
        const max = maxQtyFor(sku);
        const lines = [...get().lines];
        const i = lines.findIndex((l) => l.sku === sku);
        const current = i >= 0 ? lines[i].qty : 0;
        const next = Math.min(max, current + qty);
        if (i >= 0) lines[i] = { ...lines[i], qty: next };
        else if (next > 0) lines.push({ sku, qty: next });
        set({ lines });
        return { qty: next, capped: current + qty > max };
      },

      ensure: (sku) => {
        if (!get().lines.some((l) => l.sku === sku)) get().add(sku, 1);
      },

      setQty: (sku, qty) => {
        const max = maxQtyFor(sku);
        const next = Math.max(1, Math.min(max, Math.round(qty)));
        set({ lines: get().lines.map((l) => (l.sku === sku ? { ...l, qty: next } : l)) });
      },

      remove: (sku) => {
        const lines = get().lines;
        const index = lines.findIndex((l) => l.sku === sku);
        if (index < 0) return null;
        const line = lines[index];
        set({ lines: lines.filter((l) => l.sku !== sku) });
        return { line, index };
      },

      restore: (line, index) => {
        const lines = get().lines.filter((l) => l.sku !== line.sku);
        lines.splice(Math.min(index, lines.length), 0, line);
        set({ lines });
      },

      clear: () => set({ lines: [], promo: null }),

      applyPromo: (raw, now) => {
        const code = raw.trim().toUpperCase();
        const promo = promoCodes[code];
        if (!promo) return "invalid";
        if (now.getTime() > new Date(`${promo.expires}T23:59:59+03:00`).getTime()) return "expired";
        set({ promo: { code, percent: promo.percent } });
        return "applied";
      },

      removePromo: () => set({ promo: null }),
    }),
    {
      name: "ms-bag",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ lines: s.lines, promo: s.promo }),
      // v1 also stored a gift-wrap flag; the service was dropped.
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<Pick<BagState, "lines" | "promo">>;
        return { lines: p.lines ?? [], promo: p.promo ?? null };
      },
    },
  ),
);

/** Total units in the bag (primitive selector — safe for zustand v5). */
export const useBagCount = () => useBag((s) => s.lines.reduce((n, l) => n + l.qty, 0));

export const useLineQty = (sku: string) => useBag((s) => s.lines.find((l) => l.sku === sku)?.qty ?? 0);
