"use client";

import { useLocale, useTranslations } from "next-intl";
import { Price } from "@/components/ui/price";
import { areaById } from "@/data/kuwait-areas";
import type { Locale } from "@/i18n/routing";
import { statusKind, type AdminOrder } from "@/lib/admin/orders";
import { formatDateTime } from "@/lib/delivery";
import { formatKuwaitPhone } from "@/lib/phone";
import { SampleTag, StatusChip } from "../status-chip";
import { useFulfillment } from "./use-fulfillment";

/** Phone layout: a card per order instead of the desktop table. */
export function OrderCards({ rows, onOpen }: { rows: AdminOrder[]; onOpen: (id: string) => void }) {
  const t = useTranslations("admin");
  const locale = useLocale() as Locale;
  const fulfill = useFulfillment();

  return (
    <ul className="space-y-3">
      {rows.map((item) => {
        const { order } = item;
        const area = areaById(order.details.areaId);
        const itemsCount = order.lines.reduce((n, l) => n + l.qty, 0);
        const isDone = item.fulfillment === "done";
        const canMarkDone = item.paid;
        return (
          <li key={order.id} data-testid="order-card" className="border border-line bg-paper p-4">
            <div className="flex items-start justify-between gap-3">
              <button type="button" onClick={() => onOpen(order.id)} className="text-start">
                <span className="block font-medium underline-offset-4 hover:underline">
                  <bdi dir="ltr" className="figures whitespace-nowrap">
                    {order.id}
                  </bdi>
                </span>
                <span className="block text-[12px] text-muted">
                  <bdi>{formatDateTime(item.placedAt, locale)}</bdi>
                </span>
              </button>
              <StatusChip kind={statusKind(item)} />
            </div>

            <div className="mt-3 text-[14px]">
              <p>
                <bdi>{order.details.name}</bdi>
              </p>
              <p className="text-[12px] text-muted">
                <bdi dir="ltr" className="figures">
                  {formatKuwaitPhone(order.details.phone)}
                </bdi>
                {area && <> · {area.name[locale]}</>}
              </p>
            </div>

            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="text-[12px] text-muted">
                {t("orders.itemsCount", { count: itemsCount })} · {t(`orders.method.${order.method}`)}
              </p>
              <Price fils={order.totals.totalFils} className="text-[15px] font-medium" />
            </div>

            <div className="mt-3 flex items-center gap-4 border-t border-line pt-3">
              {item.source === "sample" && <SampleTag />}
              <div className="ms-auto flex items-center gap-4">
                {isDone ? (
                  <button
                    type="button"
                    onClick={() => fulfill.markPending(order.id)}
                    className="caps text-[12px] text-muted underline-offset-4 hover:text-ink hover:underline"
                  >
                    {t("orders.undo")}
                  </button>
                ) : canMarkDone ? (
                  <button
                    type="button"
                    onClick={() => fulfill.markDone(order.id)}
                    className="caps text-[12px] text-racing underline-offset-4 hover:underline"
                  >
                    {t("orders.markDone")}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onOpen(order.id)}
                  className="caps text-[12px] underline-offset-4 hover:underline"
                >
                  {t("orders.open")}
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
