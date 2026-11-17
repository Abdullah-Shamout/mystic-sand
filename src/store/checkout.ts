"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale } from "@/i18n/routing";
import type { PaymentMethod } from "@/data/site";
import type { Localized } from "@/data/types";
import type { PaymentRecord } from "@/lib/payments/types";
import type { Totals } from "@/lib/pricing";
import { safeJSONStorage } from "@/lib/storage";
import { emptyCheckoutForm, rememberedFields, type CheckoutForm } from "@/lib/validation";

export type OrderStatus = "pending" | "paid" | "failed" | "canceled" | "confirming";

export type OrderLine = {
  sku: string;
  slug: string;
  qty: number;
  priceFils: number;
  name: string;
  size: Localized;
  image: string;
};

export type Order = {
  id: string; // track ID, e.g. MS-10482
  createdAt: string;
  locale: Locale;
  lines: OrderLine[];
  totals: Totals;
  details: Omit<CheckoutForm, "acceptTerms">;
  promoCode: string | null;
  bagKey: string;
  method: PaymentMethod;
  status: OrderStatus;
  attempts: PaymentRecord[];
  /**
   * ADMIN-ONLY flag: a captured payment that could not be fully fulfilled (settleOrder set
   * orders.oversold). Populated by the admin order read (getSiteOrdersForAdmin); the storefront
   * receipt leaves it undefined.
   */
  oversold?: boolean;
  /** Set once the result page has applied the outcome (bag cleared etc.). */
  finalizedAt: string | null;
};

type Remembered = Partial<Pick<CheckoutForm, (typeof rememberedFields)[number]>>;

/** How many recent order ids to keep for the recordPaidOrder once-only guard. */
const RECORDED_CAP = 50;

type CheckoutState = {
  draft: CheckoutForm;
  remembered: Remembered | null;
  /**
   * Order ids already applied by recordPaidOrder on THIS device (capped, newest last). Orders are
   * server-authoritative now (money + stock live in Postgres; the admin reads them from the DB), so
   * no order payload is kept here — just the ids, so a receipt refresh clears the bag exactly once.
   */
  recordedIds: string[];
  /** The last paid order on this device — the empty-checkout "last order" link (never an unpaid one). */
  lastOrderId: string | null;

  updateDraft: (patch: Partial<CheckoutForm>) => void;
  /**
   * Applies a server-confirmed paid order's side effects on the result page, exactly once (a refresh
   * or a later visit to the receipt is a no-op). On the first call it saves "remembered" details and
   * points lastOrderId at it. Returns true only on that first call, so the caller clears the bag once.
   */
  recordPaidOrder: (order: Order) => boolean;
  forgetDetails: () => void;
  resetAll: () => void;
};

const pick = (form: CheckoutForm): Remembered =>
  Object.fromEntries(rememberedFields.map((k) => [k, form[k]])) as Remembered;

/** A stored draft with exactly the current form's fields (it may be from an older version). */
const currentFields = (draft: Partial<CheckoutForm> | undefined): CheckoutForm =>
  Object.fromEntries(
    Object.entries(emptyCheckoutForm).map(([k, v]) => [k, draft?.[k as keyof CheckoutForm] ?? v]),
  ) as CheckoutForm;

export const useCheckout = create<CheckoutState>()(
  persist(
    (set, get) => ({
      draft: emptyCheckoutForm,
      remembered: null,
      recordedIds: [],
      lastOrderId: null,

      updateDraft: (patch) => set({ draft: { ...get().draft, ...patch } }),

      recordPaidOrder: (order) => {
        // Idempotent: a refresh or a later visit to the receipt finds the id already recorded and
        // changes nothing, so the bag is cleared exactly once.
        if (get().recordedIds.includes(order.id)) return false;
        const remembered = order.details.saveDetails
          ? pick({ ...order.details, acceptTerms: true })
          : get().remembered;
        set({
          // Cap the list so it can't grow unbounded on a device with many orders (newest kept).
          recordedIds: [...get().recordedIds, order.id].slice(-RECORDED_CAP),
          // Only a paid order ever becomes the "last order" surfaced on the empty checkout page.
          lastOrderId: order.id,
          remembered,
          // One-off fields are cleared; saved details stay.
          draft: {
            ...emptyCheckoutForm,
            ...(remembered ?? {}),
            saveDetails: order.details.saveDetails,
          },
        });
        return true;
      },

      forgetDetails: () => set({ remembered: null, draft: emptyCheckoutForm }),

      resetAll: () => set({ draft: emptyCheckoutForm, remembered: null, recordedIds: [], lastOrderId: null }),
    }),
    {
      name: "ms-checkout",
      version: 3,
      storage: safeJSONStorage,
      partialize: (s) => ({
        draft: s.draft,
        remembered: s.remembered,
        recordedIds: s.recordedIds,
        lastOrderId: s.lastOrderId,
      }),
      // v1/v2 kept a device-local `orders: Record<string, Order>` map. v3 drops the payloads (orders
      // are server-authoritative; the admin reads the DB). Keep lastOrderId only if its order was
      // paid, and seed recordedIds from the paid order ids so a receipt refresh stays a no-op.
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<CheckoutState> & { orders?: Record<string, Order> };
        const paidIds = Object.values(p.orders ?? {})
          .filter((o) => o && (o.status === "paid" || o.status === "confirming"))
          .map((o) => o.id);
        const recordedIds = Array.isArray(p.recordedIds) ? p.recordedIds : paidIds.slice(-RECORDED_CAP);
        const lastOrderId =
          p.lastOrderId && (recordedIds.includes(p.lastOrderId) || paidIds.includes(p.lastOrderId))
            ? p.lastOrderId
            : null;
        return { draft: currentFields(p.draft), remembered: p.remembered ?? null, recordedIds, lastOrderId };
      },
      // Old drafts may miss fields added later, or keep removed ones (the gift options).
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<CheckoutState>;
        return {
          ...current,
          ...p,
          recordedIds: Array.isArray(p.recordedIds) ? p.recordedIds : [],
          draft: currentFields(p.draft),
        };
      },
    },
  ),
);
