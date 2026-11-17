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
   * receipt and the client-generated samples leave it undefined.
   */
  oversold?: boolean;
  /** Set once the result page has applied the outcome (bag cleared etc.). */
  finalizedAt: string | null;
};

type Remembered = Partial<Pick<CheckoutForm, (typeof rememberedFields)[number]>>;

type CheckoutState = {
  draft: CheckoutForm;
  remembered: Remembered | null;
  /**
   * DEVICE-LOCAL order history (the "My orders" list + the empty-checkout "last order" link). Orders
   * are server-authoritative now (money + stock live in Postgres); this map is a display-only record
   * of orders paid on THIS device, written by recordPaidOrder on the result page.
   */
  orders: Record<string, Order>;
  lastOrderId: string | null;

  updateDraft: (patch: Partial<CheckoutForm>) => void;
  /**
   * Records a server-confirmed paid order into the device-local history, exactly once (a refresh or a
   * later visit to the receipt is a no-op). On the first call it also saves "remembered" details and
   * points lastOrderId at it. Returns true only on that first call, so the caller clears the bag once.
   */
  recordPaidOrder: (order: Order, now: Date) => boolean;
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
      orders: {},
      lastOrderId: null,

      updateDraft: (patch) => set({ draft: { ...get().draft, ...patch } }),

      recordPaidOrder: (order, now) => {
        // Idempotent: a refresh or a later visit to the receipt finds it already recorded and changes
        // nothing, so the bag is cleared exactly once.
        if (get().orders[order.id]) return false;
        const remembered = order.details.saveDetails
          ? pick({ ...order.details, acceptTerms: true })
          : get().remembered;
        set({
          orders: {
            ...get().orders,
            [order.id]: { ...order, finalizedAt: order.finalizedAt ?? now.toISOString() },
          },
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

      resetAll: () => set({ draft: emptyCheckoutForm, remembered: null, orders: {}, lastOrderId: null }),
    }),
    {
      name: "ms-checkout",
      version: 2,
      storage: safeJSONStorage,
      partialize: (s) => ({ draft: s.draft, remembered: s.remembered, orders: s.orders, lastOrderId: s.lastOrderId }),
      // v1 priced orders with free delivery over KWD 25. Unpaid ones are dropped so they
      // can't be paid at the old total; paid ones stay in the order history.
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<Pick<CheckoutState, "draft" | "remembered" | "orders" | "lastOrderId">>;
        const orders = Object.fromEntries(
          Object.entries(p.orders ?? {}).filter(([, o]) => o.status === "paid" || o.status === "confirming"),
        );
        const lastOrderId = p.lastOrderId && orders[p.lastOrderId] ? p.lastOrderId : null;
        return { draft: currentFields(p.draft), remembered: p.remembered ?? null, orders, lastOrderId };
      },
      // Old drafts may miss fields added later, or keep removed ones (the gift options).
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<CheckoutState>;
        return { ...current, ...p, draft: currentFields(p.draft) };
      },
    },
  ),
);
