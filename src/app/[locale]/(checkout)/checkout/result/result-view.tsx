"use client";

import { OrderNotFound } from "@/components/payment/order-not-found";
import { ResultFailed } from "@/components/payment/result-failed";
import { ResultPending } from "@/components/payment/result-pending";
import { ResultSuccess } from "@/components/payment/result-success";
import type { Order } from "@/store/checkout";

/**
 * Renders the server-settled order straight from the DB order's status: success (paid), a neutral
 * "confirming" state (pending), or failed/canceled. `order` is null when the id is unknown or the
 * per-order cookie token did not match it (ownership gate) — shown as "order not found". No URL
 * parsing or on-device order reading here.
 */
export default function ResultView({ order, orderId }: { order: Order | null; orderId: string }) {
  if (!order) return <OrderNotFound orderId={orderId} />;

  if (order.status === "paid") {
    const attempt = order.attempts.find((a) => a.result === "CAPTURED") ?? order.attempts.at(-1);
    if (attempt) return <ResultSuccess order={order} attempt={attempt} />;
  }

  // A pending order has no settled outcome yet — never the "not charged / Try again" failed view.
  if (order.status === "pending") return <ResultPending order={order} />;

  return <ResultFailed order={order} attempt={order.attempts.at(-1)} reason={null} />;
}
