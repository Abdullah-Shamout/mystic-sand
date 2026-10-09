"use client";

import { Hourglass } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Price } from "@/components/ui/price";
import { newPaymentFields } from "@/lib/order";
import { mockGateway } from "@/lib/payments/mock";
import type { PaymentRecord } from "@/lib/payments/types";
import { useCheckout, type Order } from "@/store/checkout";
import { useFocusOnMount } from "./use-focus-on-mount";

// Demo: the bank "confirms" a PENDING payment after this delay.
const CONFIRM_AFTER_MS = 6000;

/** The bank confirms late. In the demo it resolves to CAPTURED (same payment ID). */
export function ResultPending({ order, attempt }: { order: Order; attempt: PaymentRecord }) {
  const t = useTranslations("payment");
  const heading = useFocusOnMount<HTMLHeadingElement>();

  useEffect(() => {
    const id = setTimeout(() => {
      const current = useCheckout.getState().orders[order.id];
      const latest = current?.attempts[current.attempts.length - 1];
      if (!latest || latest.paymentId !== attempt.paymentId || latest.result !== "PENDING") return;
      const now = new Date();
      const fields = newPaymentFields(now);
      const record: PaymentRecord = {
        ...latest,
        result: "CAPTURED",
        tranId: latest.tranId ?? fields.tranId,
        ref: fields.ref,
        auth: fields.auth,
        postDate: fields.postDate,
        at: now.toISOString(),
      };
      useCheckout.getState().recordAttempt(order.id, record);
      // Keep the address bar in step (the page itself reads the order from the store).
      const query = mockGateway.resultPath(record, order.id).split("?")[1];
      window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
    }, CONFIRM_AFTER_MS);
    return () => clearTimeout(id);
  }, [order.id, attempt.paymentId]);

  return (
    <div className="mx-auto max-w-[600px] px-4 py-16 text-center md:py-24" data-testid="result-pending">
      <span
        aria-hidden
        className="mx-auto block size-12 animate-spin-slow rounded-full border-2 border-racing border-t-transparent"
      />
      <h1
        ref={heading}
        tabIndex={-1}
        className="caps mt-8 font-serif text-title-sm font-medium outline-none md:text-title"
      >
        {t("pending.title")}
      </h1>
      <p className="mx-auto mt-3 max-w-md text-[15px] text-muted">{t("pending.text")}</p>
      <p role="status" className="mt-6 inline-flex items-center gap-2 bg-tile px-4 py-2.5 text-[14px]">
        <Hourglass className="size-4 shrink-0" strokeWidth={1.25} aria-hidden />
        {t("pending.status")}
      </p>
      <dl className="mx-auto mt-10 max-w-sm divide-y divide-line border-y border-line text-[14px]">
        <div className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-muted">{t("fields.paymentId")}</dt>
          <dd className="figures">
            <bdi>{attempt.paymentId}</bdi>
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-muted">{t("fields.trackId")}</dt>
          <dd className="figures">
            <bdi>{attempt.trackId}</bdi>
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-muted">{t("fields.amount")}</dt>
          <dd>
            <Price fils={attempt.amountFils} />
          </dd>
        </div>
      </dl>
    </div>
  );
}
