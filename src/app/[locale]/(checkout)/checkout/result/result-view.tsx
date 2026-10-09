"use client";

import { useSearchParams } from "next/navigation";
import { OrderNotFound } from "@/components/payment/order-not-found";
import { PaymentSkeleton } from "@/components/payment/payment-skeleton";
import { ResultFailed } from "@/components/payment/result-failed";
import { ResultPending } from "@/components/payment/result-pending";
import { ResultSuccess } from "@/components/payment/result-success";
import { useMounted } from "@/lib/hooks";
import { useCheckout } from "@/store/checkout";

/**
 * The URL mirrors KNET's response parameters (paymentid, result, trackid…), but the
 * outcome shown always comes from the order saved on this device — never from the URL.
 */
export default function ResultView() {
  const params = useSearchParams();
  const orderId = params.get("order") ?? "";
  const mounted = useMounted();
  const order = useCheckout((s) => (orderId ? s.orders[orderId] : undefined));

  if (!mounted) return <PaymentSkeleton variant="result" />;
  if (!order) return <OrderNotFound orderId={orderId} />;

  const attempt = order.attempts[order.attempts.length - 1];
  const key = attempt ? `${attempt.paymentId}-${attempt.result}` : "none";

  if (attempt?.result === "CAPTURED") return <ResultSuccess key={key} order={order} attempt={attempt} />;
  if (attempt?.result === "PENDING") return <ResultPending key={key} order={order} attempt={attempt} />;

  // A cosmetic hint from our own gateway (session expiry), trusted only for this very attempt.
  const timedOut = attempt !== undefined && params.get("reason") === "timeout" && params.get("paymentid") === attempt.paymentId;
  return <ResultFailed key={key} order={order} attempt={attempt} reason={timedOut ? "timeout" : null} />;
}
