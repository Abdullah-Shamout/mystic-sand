"use client";

import { useLocale, useTranslations } from "next-intl";
import { Price } from "@/components/ui/price";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/delivery";
import type { PaymentRecord, PaymentResult } from "@/lib/payments/types";
import { bankName } from "./format";

const STATUS: Record<PaymentResult, { key: string; tone: string }> = {
  CAPTURED: { key: "captured", tone: "text-success" },
  "NOT CAPTURED": { key: "notCaptured", tone: "text-danger" },
  CANCELED: { key: "canceled", tone: "text-ink" },
  PENDING: { key: "pending", tone: "text-muted" },
};

const DASH = "—";

/**
 * Every field KNET returns to the merchant, as a receipt. `compact` is the short
 * list shown when a payment did not complete.
 */
export function PaymentDetails({
  attempt,
  compact = false,
  className,
}: {
  attempt: PaymentRecord;
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("payment");
  const locale = useLocale() as Locale;
  const status = STATUS[attempt.result];
  const method = t(`methods.${attempt.method}`);
  const bank = bankName(attempt.bankId, locale);
  const code = (value: string | undefined) => <bdi>{value || DASH}</bdi>;

  const rows: Array<{ key: string; value: React.ReactNode }> = [
    {
      key: "result",
      value: (
        <>
          <bdi lang="en" className={cn("font-medium", status.tone)}>
            {attempt.result}
          </bdi>
          <span className="text-muted"> · {t(`status.${status.key}`)}</span>
        </>
      ),
    },
    { key: "paymentId", value: code(attempt.paymentId) },
    ...(compact ? [] : [{ key: "tranId", value: code(attempt.tranId) }]),
    { key: "trackId", value: code(attempt.trackId) },
    { key: "ref", value: code(attempt.ref) },
    { key: "auth", value: code(attempt.auth) },
    { key: "postDate", value: code(attempt.postDate) },
    { key: "amount", value: <Price fils={attempt.amountFils} /> },
    ...(compact
      ? []
      : [
          { key: "method", value: bank ? `${method} · ${bank}` : method },
          { key: "dateTime", value: <bdi>{formatDateTime(attempt.at, locale)}</bdi> },
        ]),
  ];

  return (
    <section
      aria-labelledby="payment-details-title"
      className={cn("border border-line bg-paper", className)}
      data-testid="payment-details"
    >
      <h2 id="payment-details-title" className="caps border-b border-line bg-tile px-5 py-3.5 text-[13px] font-medium">
        {t("fields.title")}
      </h2>
      <dl className="divide-y divide-line px-5">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex items-baseline justify-between gap-4 py-2.5 text-[14px]"
            data-testid={`field-${row.key}`}
          >
            <dt className="shrink-0 text-muted">{t(`fields.${row.key}`)}</dt>
            <dd className="figures min-w-0 text-end wrap-anywhere">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
