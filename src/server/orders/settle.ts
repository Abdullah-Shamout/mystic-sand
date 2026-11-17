import "server-only";

import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import { logger } from "@/server/log";
import { getNotifier, safeNotify } from "@/server/notify/registry";
import type { OrderNotification } from "@/server/notify/types";
import { getGateway } from "@/server/payments/registry";

// Settles a payment against its order. Called from BOTH the /checkout/result render (the only settle
// path the webhook-less sandbox has) AND the provider webhook. It must therefore be IDEMPOTENT and
// ATOMIC: calling it twice (return URL AND webhook, or a refresh) decrements stock exactly once.
//
// The whole thing runs in ONE transaction:
//   1. SELECT ... FOR UPDATE the order. If it already left "pending", return — a no-op.
//   2. verify() the payment with the provider (never trust the return-URL query for the outcome).
//   3. Bind the payment to THIS order (amount + currency + the order binding in verify.raw.orderId).
//   4. CAPTURED → lock the line variants in sku order, decrement each with a `stock >= qty` guard,
//      write an inventory_moves row per decremented line, set status=paid (oversold=true if a line
//      could not be fulfilled — a captured payment cannot be un-charged, so we page a human instead).
//   5. Insert the payment_attempts row with onConflictDoNothing(provider, providerPaymentId).
//
// The transaction returns the OUTCOME plus — on a transitioning capture only — the minimal payload a
// notification needs. The notification is fired AFTER the commit (never inside the tx: a rolled-back
// settle must not notify), exactly once per order (a later settle returns "already" before the tx body,
// so it carries no payload).
//
// It deliberately does NOT invalidate the "catalog" cache: updateTag is Server-Action-only and
// revalidateTag throws during a page render. The webhook route handler revalidates after a capture;
// the render path lets the storefront stock lag to the CATALOG_REVALIDATE backstop (documented).

export type SettleOutcome =
  | "paid" // captured and fully fulfilled — stock decremented
  | "oversold" // captured but a line could not be fulfilled — paid + oversold flag + alert
  | "failed" // NOT CAPTURED
  | "canceled" // CANCELED
  | "already" // already settled on a prior call — idempotent no-op
  | "pending" // provider has no decision yet (verify null) — no writes
  | "mismatch" // payment disagreed with the order (amount / currency / binding) — alert; attempt recorded, no stock move
  | "notfound"; // unknown order id

/** The transaction's result: the outcome, plus the notification payload on a transitioning capture. */
type SettleResult = { outcome: SettleOutcome; notify?: OrderNotification };

/** True when the outcome moved stock (the webhook should then expire the storefront catalog cache). */
export function settleChangedStock(outcome: SettleOutcome): boolean {
  return outcome === "paid" || outcome === "oversold";
}

export async function settleOrder(orderId: string): Promise<SettleOutcome> {
  if (!orderId) return "notfound";
  const gateway = getGateway();
  const db = getDb();

  const result: SettleResult = await db.transaction(async (tx): Promise<SettleResult> => {
    const [order] = await tx
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId))
      .limit(1)
      .for("update");
    if (!order) return { outcome: "notfound" };
    // Idempotency anchor: once the order has left "pending" it is settled. A concurrent second settle
    // blocks on FOR UPDATE until the first commits, then reads the updated status here and returns.
    if (order.status !== "pending") return { outcome: "already" };
    if (!order.providerPaymentId) return { outcome: "pending" }; // no payment was ever initiated

    const verify = await gateway.verify({ providerPaymentId: order.providerPaymentId });
    if (!verify) return { outcome: "pending" }; // the provider has not decided yet (or the session is gone)

    // Build the attempt row up front and record it on EVERY path that has a verified payment — including
    // a binding or amount/currency MISMATCH. A captured-but-mismatched payment must leave a reconcilable
    // record (the shopper may have been charged); onConflictDoNothing(provider, providerPaymentId) keeps
    // it idempotent so a later webhook/return for the same payment never double-inserts.
    const now = new Date();
    const attemptRow = {
      orderId: order.id,
      provider: gateway.provider,
      providerPaymentId: verify.providerPaymentId,
      trackId: verify.trackId ?? null,
      tranId: verify.tranId ?? null,
      ref: verify.ref ?? null,
      auth: verify.auth ?? null,
      bankId: verify.bankId ?? null,
      result: verify.result,
      amountFils: verify.amountFils,
      raw: verify.raw ?? null,
      verifiedAt: now,
    };
    const insertAttempt = () =>
      tx
        .insert(schema.paymentAttempts)
        .values(attemptRow)
        .onConflictDoNothing({
          target: [schema.paymentAttempts.provider, schema.paymentAttempts.providerPaymentId],
        });

    // Bind the payment to THIS order before trusting its outcome. The sandbox carries the order id in
    // raw.orderId; a real provider returns a merchant reference. A mismatch is a security anomaly — but
    // we still record the attempt (above) so a captured, mis-bound payment is never left with no trace.
    const boundOrderId = typeof verify.raw?.orderId === "string" ? verify.raw.orderId : null;
    if (boundOrderId !== order.id) {
      await insertAttempt();
      logger.error(
        { event: "payment_binding_mismatch", orderId: order.id, providerPaymentId: order.providerPaymentId, boundOrderId },
        "settleOrder: payment does not bind to this order",
      );
      return { outcome: "mismatch" };
    }

    // Declined / canceled is terminal: record the attempt, set the status, never touch stock.
    if (verify.result !== "CAPTURED") {
      await insertAttempt();
      const status = verify.result === "CANCELED" ? "canceled" : "failed";
      await tx.update(schema.orders).set({ status, finalizedAt: now }).where(eq(schema.orders.id, order.id));
      return { outcome: status };
    }

    // CAPTURED — money moved. The amount + currency MUST match the server-repriced total. Record the
    // attempt first so a mismatched capture (possibly a real charge) is reconcilable, then alert.
    if (verify.amountFils !== order.totalFils || verify.currency !== "KWD") {
      await insertAttempt();
      logger.error(
        { event: "payment_amount_mismatch", orderId: order.id, expectedFils: order.totalFils, gotFils: verify.amountFils, currency: verify.currency },
        "settleOrder: captured amount/currency does not match order total",
      );
      return { outcome: "mismatch" };
    }

    await insertAttempt();

    // Fold the order's lines to a qty-per-sku (an order never has two lines of one sku, but be safe).
    const lines = await tx
      .select({ sku: schema.orderLines.sku, qty: schema.orderLines.qty })
      .from(schema.orderLines)
      .where(eq(schema.orderLines.orderId, order.id));
    const needBySku = new Map<string, number>();
    for (const l of lines) needBySku.set(l.sku, (needBySku.get(l.sku) ?? 0) + l.qty);
    const skus = [...needBySku.keys()].sort((a, b) => a.localeCompare(b));

    // Lock the variant rows up front, in sku order, so two concurrent settlements can never deadlock.
    const variantRows =
      skus.length === 0
        ? []
        : await tx
            .select({ id: schema.variants.id, sku: schema.variants.sku })
            .from(schema.variants)
            .where(inArray(schema.variants.sku, skus))
            .orderBy(asc(schema.variants.sku))
            .for("update");
    const idBySku = new Map(variantRows.map((v) => [v.sku, v.id]));

    let oversold = false;
    for (const sku of skus) {
      const qty = needBySku.get(sku)!;
      const variantId = idBySku.get(sku);
      if (!variantId) {
        oversold = true; // the variant was deleted since checkout — cannot fulfil this line
        continue;
      }
      // Guarded decrement: the WHERE stock >= qty makes an under-stocked line a no-op (rowCount 0),
      // never a negative stock (the CHECK would abort the whole tx).
      const decremented = await tx
        .update(schema.variants)
        .set({ stock: sql`${schema.variants.stock} - ${qty}` })
        .where(and(eq(schema.variants.id, variantId), gte(schema.variants.stock, qty)))
        .returning({ id: schema.variants.id });
      if (decremented.length === 0) {
        oversold = true;
        continue;
      }
      await tx.insert(schema.inventoryMoves).values({ variantId, delta: -qty, reason: "sale", orderId: order.id });
    }

    await tx
      .update(schema.orders)
      .set({ status: "paid", oversold, paidAt: now, finalizedAt: now })
      .where(eq(schema.orders.id, order.id));

    // The notification payload is built from the POST-settle LOCAL `oversold` — order.oversold is the
    // stale pre-settle value (false). Name comes from the frozen checkout details snapshot.
    const notify: OrderNotification = {
      id: order.id,
      phoneE164: order.phoneE164,
      name: order.details.name,
      totalFils: order.totalFils,
      oversold,
      locale: order.locale,
    };

    if (oversold) {
      logger.error(
        { event: "order_oversold", orderId: order.id },
        "settleOrder: captured payment could not be fully fulfilled — marked paid+oversold (cannot un-charge)",
      );
      return { outcome: "oversold", notify };
    }
    return { outcome: "paid", notify };
  });

  // Fire the notification AFTER the commit, never inside the tx — a rolled-back settle must not notify.
  // Only a transitioning capture ("paid"/"oversold") attaches a payload, and a later settle returns
  // "already" before the tx body runs, so this fires EXACTLY once per order. safeNotify swallows any
  // channel error: a notification must never break the (already-committed) settle.
  if (result.notify && (result.outcome === "paid" || result.outcome === "oversold")) {
    await safeNotify(() => getNotifier().orderPaid(result.notify!));
  }
  return result.outcome;
}
