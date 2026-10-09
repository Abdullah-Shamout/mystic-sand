"use client";

import { useLocale, useTranslations } from "next-intl";
import { Price } from "@/components/ui/price";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import { hasImage } from "@/lib/media";
import type { Order } from "@/store/checkout";

function TotalRow({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", className)}>
      <dt>{label}</dt>
      <dd className="text-end">{children}</dd>
    </div>
  );
}

/** Lines and totals as they were when the order was placed (not re-priced from the catalogue). */
export function OrderSummary({ order }: { order: Order }) {
  const t = useTranslations("payment.summary");
  const locale = useLocale() as Locale;
  const { totals } = order;
  return (
    <section aria-labelledby="order-summary-title">
      <h2 id="order-summary-title" className="caps font-serif text-title-sm font-medium">
        {t("title")}
      </h2>
      <ul className="mt-5 divide-y divide-line border-y border-line">
        {order.lines.map((line) => (
          <li key={line.sku} className="flex gap-4 py-4">
            <div className="relative size-20 shrink-0 bg-tile sm:size-24">
              {hasImage(line.image) && <ResponsiveImage image={line.image} alt="" sizes="96px" />}
            </div>
            <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="caps font-serif text-[18px] leading-tight font-medium sm:text-[20px]">
                  <bdi lang="en">{line.name}</bdi>
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  <bdi className="whitespace-nowrap">{line.size[locale]}</bdi> · {t("qty", { qty: String(line.qty) })}
                </p>
              </div>
              <Price fils={line.priceFils * line.qty} className="text-[15px]" />
            </div>
          </li>
        ))}
      </ul>
      <dl className="mt-4 space-y-1.5 text-[14px]">
        <TotalRow label={t("subtotal")}>
          <Price fils={totals.subtotalFils} />
        </TotalRow>
        {totals.discountFils > 0 && (
          <TotalRow
            label={order.promoCode ? t("discount", { code: order.promoCode }) : t("discountNoCode")}
            className="text-success"
          >
            −<Price fils={totals.discountFils} />
          </TotalRow>
        )}
        <TotalRow label={t("delivery")}>
          <Price fils={totals.deliveryFils} free />
        </TotalRow>
        {order.giftWrap && (
          <TotalRow label={t("giftWrap")}>
            <Price fils={totals.giftWrapFils} free />
          </TotalRow>
        )}
        <TotalRow label={t("total")} className="border-t border-line pt-2.5 text-[16px] font-medium">
          <Price fils={totals.totalFils} />
        </TotalRow>
      </dl>
    </section>
  );
}
