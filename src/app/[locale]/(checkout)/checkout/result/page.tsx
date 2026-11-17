import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { cookies } from "next/headers";

import { settleOrder } from "@/server/orders/settle";
import { checkoutCookieName } from "@/server/orders/cookie";
import { logger, redactError } from "@/server/log";
import { getOrderForResult } from "@/server/read/orders";
import ResultView from "./result-view";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "payment" });
  return { title: t("meta.resultTitle") };
}

// Server-rendered now: it SETTLES the payment on the server (idempotent), then loads the order from
// the DB. The webhook-less sandbox has no other settle path, so settle runs unconditionally on every
// visit; the outcome shown is the DB order's status, never the URL `?result`. Display is OWNERSHIP-
// GATED — the per-order cookie token must match orders.checkoutToken, so a bare MS-##### from someone
// else's link resolves to "order not found" (no IDOR) even though the order itself is still settled.
export default async function ResultPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sp = await searchParams;
  const orderId = typeof sp.order === "string" ? sp.order : "";

  // Settle best-effort: a transient settle throw (e.g. a lock timeout) must not block the receipt from
  // rendering the order's current DB state. The provider webhook is the durable settle path and
  // tolerates throws of its own, so a missed settle here is retried server-to-server.
  if (orderId) {
    try {
      await settleOrder(orderId);
    } catch (error) {
      logger.error({ event: "result_settle_failed", orderId, err: redactError(error) }, "result page settleOrder threw");
    }
  }

  const token = orderId ? ((await cookies()).get(checkoutCookieName(orderId))?.value ?? null) : null;
  const order = await getOrderForResult(orderId, token);

  return <ResultView order={order} orderId={orderId} />;
}
