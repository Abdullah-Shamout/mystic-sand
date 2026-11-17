import "server-only";

import { asc, desc, eq, inArray } from "drizzle-orm";

import { kuwaitClock } from "@/lib/delivery";
import type { PaymentRecord, PaymentResult } from "@/lib/payments/types";
import { requireAdmin } from "@/server/auth/require-admin";
import { getDb, schema } from "@/server/db";
import type { Order, OrderLine } from "@/store/checkout";

// Server read layer for orders. ONE mapper (toClientOrder) turns the DB rows into the client `Order`
// shape the result page and the admin dashboard already render — built field by field so the
// `checkoutToken` column (the result page's ownership proof) never crosses into a payload.
//
// `getOrderForResult` is OWNERSHIP-GATED: the id alone is not enough; the caller must present the
// httpOnly cookie token that matches `orders.checkoutToken` (set at initiateCheckout). This is the
// IDOR guard — a bare MS-##### from someone else's receipt link resolves to null.
//
// `getSiteOrdersForAdmin` is admin-gated and returns PAID site orders only; samples still come from
// the client ms-admin store (merged in the dashboard) until Phase 7.

type OrderRow = typeof schema.orders.$inferSelect;
type OrderLineRow = typeof schema.orderLines.$inferSelect;
type PaymentAttemptRow = typeof schema.paymentAttempts.$inferSelect;

/** MMDD in Kuwait time (the receipt's postDate field). */
function mmdd(date: Date): string {
  const c = kuwaitClock(date);
  return `${String(c.month).padStart(2, "0")}${String(c.day).padStart(2, "0")}`;
}

function toLine(row: OrderLineRow): OrderLine {
  return {
    sku: row.sku,
    slug: row.slug,
    qty: row.qty,
    priceFils: row.priceFils,
    name: row.name,
    size: row.size,
    image: row.image ?? "",
  };
}

function toAttempt(row: PaymentAttemptRow, method: Order["method"]): PaymentRecord {
  return {
    method,
    result: (row.result ?? "NOT CAPTURED") as PaymentResult,
    // The provider's payment id stands in for KNET's `paymentid` on the receipt.
    paymentId: row.providerPaymentId,
    trackId: row.trackId ?? row.orderId,
    tranId: row.tranId ?? undefined,
    ref: row.ref ?? undefined,
    auth: row.auth ?? undefined,
    postDate: mmdd(row.createdAt),
    amountFils: row.amountFils,
    bankId: row.bankId ?? undefined,
    at: row.createdAt.toISOString(),
  };
}

/** DB rows → the client `Order` shape. `checkoutToken` is deliberately never copied. */
export function toClientOrder(
  order: OrderRow,
  lines: OrderLineRow[],
  attempts: PaymentAttemptRow[],
): Order {
  const mappedLines = lines.map(toLine);
  const itemCount = mappedLines.reduce((n, l) => n + l.qty, 0);
  return {
    id: order.id,
    createdAt: order.createdAt.toISOString(),
    locale: order.locale,
    lines: mappedLines,
    totals: {
      itemCount,
      subtotalFils: order.subtotalFils,
      discountFils: order.discountFils,
      deliveryFils: order.deliveryFils,
      totalFils: order.totalFils,
    },
    details: order.details,
    promoCode: order.promoCode,
    bagKey: order.bagKey,
    method: order.method,
    status: order.status,
    attempts: attempts.map((a) => toAttempt(a, order.method)),
    finalizedAt: (order.paidAt ?? order.finalizedAt)?.toISOString() ?? null,
  };
}

/**
 * The order behind a /checkout/result view, or null when the id is unknown OR the presented token
 * does not match the order's `checkoutToken`. The token comes from the per-order httpOnly cookie, so
 * only the device that checked out can read its own receipt.
 */
export async function getOrderForResult(orderId: string, token: string | null): Promise<Order | null> {
  if (!orderId || !token) return null;
  const db = getDb();
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId)).limit(1);
  if (!order || order.checkoutToken !== token) return null;

  const lines = await db.select().from(schema.orderLines).where(eq(schema.orderLines.orderId, orderId));
  const attempts = await db
    .select()
    .from(schema.paymentAttempts)
    .where(eq(schema.paymentAttempts.orderId, orderId))
    .orderBy(asc(schema.paymentAttempts.createdAt));
  return toClientOrder(order, lines, attempts);
}

/**
 * Every PAID site order, newest first, for the admin dashboard + product analysis. Admin-gated (it
 * returns customer PII and receipts). The dashboard merges these with the client-generated samples.
 */
export async function getSiteOrdersForAdmin(): Promise<Order[]> {
  await requireAdmin();
  const db = getDb();
  const orderRows = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.status, "paid"))
    .orderBy(desc(schema.orders.createdAt));
  if (orderRows.length === 0) return [];

  const ids = orderRows.map((o) => o.id);
  const lineRows = await db.select().from(schema.orderLines).where(inArray(schema.orderLines.orderId, ids));
  const attemptRows = await db
    .select()
    .from(schema.paymentAttempts)
    .where(inArray(schema.paymentAttempts.orderId, ids))
    .orderBy(asc(schema.paymentAttempts.createdAt));

  const linesByOrder = new Map<string, OrderLineRow[]>();
  for (const l of lineRows) {
    const list = linesByOrder.get(l.orderId);
    if (list) list.push(l);
    else linesByOrder.set(l.orderId, [l]);
  }
  const attemptsByOrder = new Map<string, PaymentAttemptRow[]>();
  for (const a of attemptRows) {
    const list = attemptsByOrder.get(a.orderId);
    if (list) list.push(a);
    else attemptsByOrder.set(a.orderId, [a]);
  }

  // `oversold` is carried through for the admin dashboard only (a captured-but-unfulfillable order a
  // human must act on). It is attached here rather than inside toClientOrder so it never leaks into the
  // customer-facing result page, which shares that mapper.
  return orderRows.map((o) => ({
    ...toClientOrder(o, linesByOrder.get(o.id) ?? [], attemptsByOrder.get(o.id) ?? []),
    oversold: o.oversold,
  }));
}
