"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Gateway } from "@/components/payment/gateway";
import type { GatewayMethod } from "@/components/payment/method-badge";
import { OrderNotFound } from "@/components/payment/order-not-found";
import { PaymentSkeleton } from "@/components/payment/payment-skeleton";
import { useRouter } from "@/i18n/navigation";
import { clampBagToStock, orderExceedsStock } from "@/lib/capture";
import { useMounted } from "@/lib/hooks";
import { mockGateway } from "@/lib/payments/mock";
import { useCheckout, type Order } from "@/store/checkout";
import { useUi } from "@/store/ui";

/** Where a settled order lives; decided once at mount (our own attempt must not trigger it). */
function settledPath(order: Order): string | null {
  const settled = order.finalizedAt !== null || order.status === "paid" || order.status === "confirming";
  if (!settled) return null;
  const last = order.attempts[order.attempts.length - 1];
  return last ? mockGateway.resultPath(last, order.id) : `/checkout/result?order=${encodeURIComponent(order.id)}`;
}

function GatewayGate({ order, method }: { order: Order; method: GatewayMethod }) {
  const router = useRouter();
  const tc = useTranslations("common");
  const pushToast = useUi((s) => s.pushToast);
  // Decided once at mount: a settled order jumps to its result; an order that now exceeds stock
  // (opened directly, or in a second tab after another sale) is refused before any capture.
  const [action] = useState<{ type: "redirect"; path: string } | { type: "refuse" } | null>(() => {
    const settled = settledPath(order);
    if (settled) return { type: "redirect", path: settled };
    if (orderExceedsStock(order)) return { type: "refuse" };
    return null;
  });

  useEffect(() => {
    if (!action) return;
    if (action.type === "redirect") {
      router.replace(action.path);
      return;
    }
    clampBagToStock();
    pushToast({ title: tc("stockRefused") });
    router.replace("/cart");
  }, [action, router, pushToast, tc]);

  if (action) return <PaymentSkeleton />;
  return <Gateway order={order} method={method} />;
}

export default function PayView() {
  const params = useSearchParams();
  const orderId = params.get("order") ?? "";
  const methodParam = params.get("method");
  const mounted = useMounted();
  const order = useCheckout((s) => (orderId ? s.orders[orderId] : undefined));

  if (!mounted) return <PaymentSkeleton />;
  if (!order) return <OrderNotFound orderId={orderId} />;

  const method: GatewayMethod =
    methodParam === "knet" || methodParam === "card" ? methodParam : order.method === "card" ? "card" : "knet";
  return <GatewayGate key={`${order.id}|${method}`} order={order} method={method} />;
}
