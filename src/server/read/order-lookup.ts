import "server-only";

import { and, eq } from "drizzle-orm";

import type { PaymentMethod } from "@/data/site";
import type { Localized } from "@/data/types";
import type { Locale } from "@/i18n/routing";
import { getDb, schema } from "@/server/db";

// The REDUCED read behind the guest order lookup (src/server/actions/orders.ts). It is deliberately a
// separate module from src/server/read/orders.ts and does NOT reuse toClientOrder: the lookup surface
// is cross-device and only phone-authenticated, so the projection must carry the bare minimum needed
// to render a receipt and NOTHING that identifies the shopper or the payment.
//
// EXCLUDED on purpose (never copied into LookupOrderView): details (address / name / phone),
// attempts (payment refs / ids), checkoutToken, oversold, promoCode, bagKey, phoneE164. Only a PAID
// order is ever returned, so `status` is the literal "paid".

type OrderRow = typeof schema.orders.$inferSelect;
type OrderLineRow = typeof schema.orderLines.$inferSelect;

export type LookupOrderLine = {
  name: string;
  size: Localized;
  qty: number;
  priceFils: number;
  image: string;
};

export type LookupOrderView = {
  id: string;
  createdAt: string; // ISO
  status: "paid";
  method: PaymentMethod;
  locale: Locale;
  lines: LookupOrderLine[];
  totals: {
    itemCount: number;
    subtotalFils: number;
    discountFils: number;
    deliveryFils: number;
    totalFils: number;
  };
};

/** DB rows → the minimal receipt view. Field-by-field, so no sensitive column can ride along. */
export function toLookupView(order: OrderRow, lines: OrderLineRow[]): LookupOrderView {
  const mappedLines: LookupOrderLine[] = lines.map((l) => ({
    name: l.name,
    size: l.size,
    qty: l.qty,
    priceFils: l.priceFils,
    image: l.image ?? "",
  }));
  const itemCount = mappedLines.reduce((n, l) => n + l.qty, 0);
  return {
    id: order.id,
    createdAt: order.createdAt.toISOString(),
    status: "paid",
    method: order.method,
    locale: order.locale,
    lines: mappedLines,
    totals: {
      itemCount,
      subtotalFils: order.subtotalFils,
      discountFils: order.discountFils,
      deliveryFils: order.deliveryFils,
      totalFils: order.totalFils,
    },
  };
}

/**
 * The PAID order matching BOTH the id and the phone, or null. ONE query carries both predicates (plus
 * status = 'paid'), so an unknown id and a wrong phone are INDISTINGUISHABLE — there is no existence
 * oracle. A non-paid order (pending / failed / canceled) also resolves to null.
 */
export async function lookupPaidOrder(
  orderId: string,
  phoneE164: string,
): Promise<LookupOrderView | null> {
  if (!orderId || !phoneE164) return null;
  const db = getDb();
  const [order] = await db
    .select()
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.id, orderId),
        eq(schema.orders.phoneE164, phoneE164),
        eq(schema.orders.status, "paid"),
      ),
    )
    .limit(1);
  if (!order) return null;

  const lines = await db
    .select()
    .from(schema.orderLines)
    .where(eq(schema.orderLines.orderId, orderId));
  return toLookupView(order, lines);
}
