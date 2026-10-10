"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale } from "@/i18n/routing";
import type { PaymentMethod } from "@/data/site";
import type { Localized } from "@/data/types";
import type { PaymentRecord, PaymentResult } from "@/lib/payments/types";
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
  /** Set once the result page has applied the outcome (bag cleared etc.). */
  finalizedAt: string | null;
};

const statusFor = (result: PaymentResult): OrderStatus =>
  result === "CAPTURED" ? "paid" : result === "PENDING" ? "confirming" : result === "CANCELED" ? "canceled" : "failed";

type Remembered = Partial<Pick<CheckoutForm, (typeof rememberedFields)[number]>>;

type CheckoutState = {
  draft: CheckoutForm;
  remembered: Remembered | null;
  orders: Record<string, Order>;
  lastOrderId: string | null;

  updateDraft: (patch: Partial<CheckoutForm>) => void;
  /** Reuses the open pending order when nothing that affects the amount changed. */
  createOrReuseOrder: (input: Omit<Order, "createdAt" | "status" | "attempts" | "finalizedAt">, now: Date) => string;
  recordAttempt: (orderId: string, record: PaymentRecord) => void;
  /** Applies a captured/settled outcome exactly once. Returns true on the first call. */
  finalize: (orderId: string, now: Date) => boolean;
  setMethod: (orderId: string, method: PaymentMethod) => void;
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

      createOrReuseOrder: (input, now) => {
        const existing = Object.values(get().orders).find(
          (o) => o.bagKey === input.bagKey && (o.status === "pending" || o.status === "failed" || o.status === "canceled"),
        );
        if (existing) {
          set({
            orders: {
              ...get().orders,
              [existing.id]: { ...existing, ...input, id: existing.id, status: "pending" },
            },
          });
          return existing.id;
        }
        const order: Order = {
          ...input,
          createdAt: now.toISOString(),
          status: "pending",
          attempts: [],
          finalizedAt: null,
        };
        // `lastOrderId` deliberately points only at a paid order (set in finalize), never at a
        // pending/abandoned checkout, so the empty-checkout "View your last order" link is safe.
        set({ orders: { ...get().orders, [order.id]: order } });
        return order.id;
      },

      recordAttempt: (orderId, record) => {
        const order = get().orders[orderId];
        if (!order) return;
        set({
          orders: {
            ...get().orders,
            [orderId]: { ...order, attempts: [...order.attempts, record], status: statusFor(record.result), method: record.method },
          },
        });
      },

      finalize: (orderId, now) => {
        const order = get().orders[orderId];
        if (!order || order.finalizedAt || order.status !== "paid") return false;
        const remembered = order.details.saveDetails ? pick({ ...order.details, acceptTerms: true }) : get().remembered;
        set({
          orders: { ...get().orders, [orderId]: { ...order, finalizedAt: now.toISOString() } },
          // Only a paid order ever becomes the "last order" surfaced on the empty checkout page.
          lastOrderId: orderId,
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

      setMethod: (orderId, method) => {
        const order = get().orders[orderId];
        if (order) set({ orders: { ...get().orders, [orderId]: { ...order, method } } });
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
