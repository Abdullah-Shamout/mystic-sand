"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Price } from "@/components/ui/price";
import { areaById } from "@/data/kuwait-areas";
import type { Locale } from "@/i18n/routing";
import { statusKind, type AdminOrder, type SortDir, type SortKey } from "@/lib/admin/orders";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/delivery";
import { formatKuwaitPhone } from "@/lib/phone";
import { SampleTag, StatusChip } from "../status-chip";
import { useFulfillment } from "./use-fulfillment";

type Sort = { key: SortKey; dir: SortDir };

function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = "start",
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "start" | "end";
}) {
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("px-3 py-2.5 font-medium", align === "end" ? "text-end" : "text-start")}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn("caps inline-flex items-center gap-1 text-[12px] hover:text-ink", active ? "text-ink" : "text-muted")}
      >
        {label}
        {active && (dir === "asc" ? <ChevronUp className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />)}
      </button>
    </th>
  );
}

export function OrdersTable({
  rows,
  sort,
  onSortChange,
  onOpen,
}: {
  rows: AdminOrder[];
  sort: Sort;
  onSortChange: (sort: Sort) => void;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations("admin");
  const locale = useLocale() as Locale;
  const fulfill = useFulfillment();

  const toggle = (key: SortKey) =>
    onSortChange({ key, dir: sort.key === key && sort.dir === "desc" ? "asc" : "desc" });

  return (
    <div className="overflow-x-auto border border-line">
      <table className="w-full min-w-[900px] border-collapse text-[14px]">
        <thead className="border-b border-line bg-tile">
          <tr>
            <th scope="col" className="caps px-3 py-2.5 text-start text-[12px] font-medium text-muted">
              {t("orders.th.number")}
            </th>
            <SortHeader label={t("orders.th.date")} active={sort.key === "date"} dir={sort.dir} onClick={() => toggle("date")} />
            <th scope="col" className="caps px-3 py-2.5 text-start text-[12px] font-medium text-muted">
              {t("orders.th.customer")}
            </th>
            <th scope="col" className="caps px-3 py-2.5 text-start text-[12px] font-medium text-muted">
              {t("orders.th.area")}
            </th>
            <th scope="col" className="caps px-3 py-2.5 text-start text-[12px] font-medium text-muted">
              {t("orders.th.items")}
            </th>
            <th scope="col" className="caps px-3 py-2.5 text-start text-[12px] font-medium text-muted">
              {t("orders.th.delivery")}
            </th>
            <th scope="col" className="caps px-3 py-2.5 text-start text-[12px] font-medium text-muted">
              {t("orders.th.payment")}
            </th>
            <SortHeader label={t("orders.th.total")} active={sort.key === "total"} dir={sort.dir} onClick={() => toggle("total")} align="end" />
            <th scope="col" className="caps px-3 py-2.5 text-start text-[12px] font-medium text-muted">
              {t("orders.th.status")}
            </th>
            <th scope="col" className="caps px-3 py-2.5 text-end text-[12px] font-medium text-muted">
              {t("orders.th.actions")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((item) => {
            const { order } = item;
            const area = areaById(order.details.areaId);
            const itemsCount = order.lines.reduce((n, l) => n + l.qty, 0);
            const isDone = item.fulfillment === "done";
            const canMarkDone = order.status === "paid";
            return (
              <tr
                key={order.id}
                data-testid="order-row"
                data-order-id={order.id}
                data-total={order.totals.totalFils}
                className="align-top hover:bg-tile/50"
              >
                <td className="px-3 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => onOpen(order.id)}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    <bdi dir="ltr" className="figures whitespace-nowrap">
                      {order.id}
                    </bdi>
                  </button>
                  {item.source === "sample" && <SampleTag className="ms-2 align-middle" />}
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-muted">
                  <bdi>{formatDateTime(item.placedAt, locale)}</bdi>
                </td>
                <td className="px-3 py-3">
                  <span className="block">
                    <bdi>{order.details.name}</bdi>
                  </span>
                  <span className="block whitespace-nowrap text-[12px] text-muted">
                    <bdi dir="ltr" className="figures">
                      {formatKuwaitPhone(order.details.phone)}
                    </bdi>
                  </span>
                </td>
                <td className="px-3 py-3 text-muted">{area ? area.name[locale] : "—"}</td>
                <td className="px-3 py-3 whitespace-nowrap text-muted">{t("orders.itemsCount", { count: itemsCount })}</td>
                <td className="px-3 py-3 whitespace-nowrap text-muted">{t(`orders.delivery.${order.details.deliveryMethod}`)}</td>
                <td className="px-3 py-3 whitespace-nowrap text-muted">{t(`orders.method.${order.method}`)}</td>
                <td className="px-3 py-3 text-end">
                  <Price fils={order.totals.totalFils} className="font-medium" />
                </td>
                <td className="px-3 py-3">
                  <StatusChip kind={statusKind(item)} />
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-3 whitespace-nowrap">
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
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
