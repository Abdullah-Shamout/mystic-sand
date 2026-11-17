import "server-only";

import { and, asc, eq, gt, lt, type SQL } from "drizzle-orm";

import { getDb, schema } from "@/server/db";
import { logger, redactError } from "@/server/log";
import { settleOrder } from "@/server/orders/settle";
import { getGateway } from "@/server/payments/registry";

// Stale-pending reconciliation, IN-PROCESS ONLY (invoked by the secret-gated reconcile Route Handler;
// the Phase 9 cron will POST that route). For each order stuck in "pending" past the cutoff it:
//   1. calls settleOrder(id) FIRST — this RECOVERS a captured-but-never-returned order whose provider
//      session is still live (settle verifies with the provider and decrements stock atomically); and
//   2. if the order is STILL pending AND carries NO payment attempt, force-cancels it.
//
// It never touches stock itself — ONLY settleOrder moves stock (so a recovery decrements exactly once,
// idempotently). Correctness guards:
//   • FLOOR (A1): the cutoff can never be younger than a live provider session (+ margin), in ANY
//     environment — a younger order may still have a shopper mid-payment (verify returns null until
//     they finish), so cancelling it could drop a capture about to land. Enforced HERE so every caller
//     is protected, not just the route.
//   • CANCEL ONLY ON DURABLE NON-CAPTURE (A2): per settle.ts, a still-pending order that has a
//     payment_attempts row is a MISMATCH (a possibly-charged payment) — a human reconciles it, we never
//     auto-cancel. The re-check + cancel run in ONE locking transaction, which also closes the window
//     between a late capture's attempt insert and our update.
//   • KEYSET SWEEP (A3): page by the unique text id ascending past a cursor, so skipped rows
//     (mismatches) don't sit at the head of every sweep forever (and the cursor round-trips exactly).

export type ReconcileSummary = { settled: number; canceled: number; skipped: number };

/** Safety margin added on top of the gateway's session lifetime before an order may be canceled. */
const MARGIN_MS = 5 * 60 * 1000;
/** Rows per keyset page — bounds memory and keeps the sweep moving past skipped rows. */
const PAGE_SIZE = 200;

export async function reconcileStalePending(olderThanMs: number): Promise<ReconcileSummary> {
  const db = getDb();
  const effectiveMs = Math.max(olderThanMs, getGateway().sessionLifetimeMs + MARGIN_MS);
  const cutoff = new Date(Date.now() - effectiveMs);

  let settled = 0;
  let canceled = 0;
  let skipped = 0;
  // Keyset cursor on the UNIQUE text id ALONE. The sweep needs only a total order over the ids (not
  // oldest-first), and a text id round-trips exactly — unlike created_at, which is microsecond-precise
  // in Postgres but a millisecond JS Date on read, so an (created_at,id) cursor could re-match a
  // boundary skipped row and, with ≥PAGE_SIZE same-millisecond rows, loop forever. `id > :lastId`
  // strictly advances, so skipped rows (mismatches) never re-block and termination is guaranteed.
  let cursor: string | null = null;

  for (;;) {
    const where: SQL | undefined = and(
      eq(schema.orders.status, "pending"),
      lt(schema.orders.createdAt, cutoff),
      ...(cursor ? [gt(schema.orders.id, cursor)] : []),
    );

    const page = await db
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(where)
      .orderBy(asc(schema.orders.id))
      .limit(PAGE_SIZE);
    if (page.length === 0) break;

    for (const row of page) {
      cursor = row.id;
      try {
        const outcome = await settleOrder(row.id);
        if (outcome === "paid" || outcome === "oversold") {
          settled++;
          continue;
        }
        if (outcome !== "pending") {
          skipped++; // already settled by a racing webhook/return, declined, canceled, or a mismatch
          continue;
        }

        // Still pending after settle. Lock the row, re-check it is pending AND attempt-free, cancel.
        const action = await db.transaction(async (tx) => {
          const [locked] = await tx
            .select({ status: schema.orders.status })
            .from(schema.orders)
            .where(eq(schema.orders.id, row.id))
            .limit(1)
            .for("update");
          if (!locked || locked.status !== "pending") return "skip";
          const [attempt] = await tx
            .select({ id: schema.paymentAttempts.id })
            .from(schema.paymentAttempts)
            .where(eq(schema.paymentAttempts.orderId, row.id))
            .limit(1);
          if (attempt) return "skip"; // durable evidence of a (possibly captured) payment — leave it
          await tx
            .update(schema.orders)
            .set({ status: "canceled", finalizedAt: new Date() })
            .where(eq(schema.orders.id, row.id));
          return "cancel";
        });
        if (action === "cancel") canceled++;
        else skipped++;
      } catch (error) {
        // A throw rolled the work back; the row still reads pending. Never cancel on a throw.
        logger.error(
          { event: "reconcile_order_failed", orderId: row.id, err: redactError(error) },
          "reconcileStalePending: order failed",
        );
        skipped++;
      }
    }

    if (page.length < PAGE_SIZE) break;
  }

  return { settled, canceled, skipped };
}
