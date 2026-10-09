import { createTranslator } from "next-intl";
import { banks } from "@/data/banks";
import { areaById, governorates } from "@/data/kuwait-areas";
import type { Locale } from "@/i18n/routing";
import { kuwaitClock } from "@/lib/delivery";
import { statusKind, type AdminOrder, type Filters, type Kpis } from "./orders";
import arMessages from "../../../messages/ar/admin.json";
import enMessages from "../../../messages/en/admin.json";

// Pure sheet builders for the orders export. They return plain "sheet specs" (data + options)
// in the shape write-excel-file expects; excel-writer.ts turns them into a Blob on click. No
// write-excel-file import here, so this stays out of the storefront bundles.

type CellType = StringConstructor | NumberConstructor | DateConstructor | BooleanConstructor;

export type XlsxCell =
  | {
      value: string | number | boolean | Date | null;
      type?: CellType;
      format?: string;
      fontWeight?: "bold";
      backgroundColor?: string;
      align?: "left" | "center" | "right";
    }
  | null;

export type XlsxSheet = {
  data: XlsxCell[][];
  sheet: string;
  columns?: Array<{ width?: number }>;
  stickyRowsCount?: number;
  rightToLeft?: boolean;
};

const MONEY = "0.000";
const DATE = "yyyy-mm-dd hh:mm";
const HEADER_BG = "#E8E0CA";

const header = (value: string): XlsxCell => ({ value, fontWeight: "bold", backgroundColor: HEADER_BG });
const text = (value: string | null | undefined): XlsxCell => ({ value: value ?? "", type: String, format: "@" });
const label = (value: string): XlsxCell => ({ value, type: String });
const money = (fils: number): XlsxCell => ({ value: fils / 1000, type: Number, format: MONEY });
const count = (value: number): XlsxCell => ({ value, type: Number });

/** Excel serial numbers are timezone-naive; build the Date from the Kuwait wall-clock components. */
function dateCell(iso: string | null): XlsxCell {
  if (!iso) return null;
  const c = kuwaitClock(new Date(iso));
  const value = new Date(Date.UTC(c.year, c.month - 1, c.day, Math.floor(c.minutes / 60), c.minutes % 60));
  return { value, type: Date, format: DATE };
}

/** Excel sheet names must be ≤31 chars and may not contain []:*?/\. */
function sheetName(name: string): string {
  return name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31).trim() || "Sheet";
}

function addressLine(order: AdminOrder["order"], t: (key: string) => string): string {
  const d = order.details;
  const parts = [
    d.street,
    d.avenue,
    `${t("orders.export.addr.block")} ${d.block}`,
    `${t("orders.export.addr.building")} ${d.building}`,
    d.floor ? `${t("orders.export.addr.floor")} ${d.floor}` : "",
    d.apartment ? `${t("orders.export.addr.apartment")} ${d.apartment}` : "",
  ];
  return parts.filter(Boolean).join(", ");
}

/**
 * The three-sheet orders workbook (Orders · Items · Summary) for the current filtered rows,
 * with headers in the admin's language and right-to-left layout for Arabic.
 */
export function buildOrdersExport(input: {
  rows: AdminOrder[];
  kpis: Kpis;
  filters: Filters;
  locale: Locale;
  now: Date;
}): XlsxSheet[] {
  const { rows, kpis, filters, locale, now } = input;
  const messages = locale === "ar" ? arMessages : enMessages;
  const translator = createTranslator({ locale, messages: { admin: messages }, namespace: "admin", timeZone: "Asia/Kuwait" });
  // The dashboard builds keys dynamically (status.<kind>, export.orders.<field>…), so use a
  // string-keyed view of the translator rather than the strict literal-key signature.
  const t = translator as unknown as (key: string) => string;
  const rtl = locale === "ar";
  const h = (key: string) => header(t(`orders.export.orders.${key}`));

  // ── Orders sheet ───────────────────────────────────────────────────────────
  const ordersHeader: XlsxCell[] = [
    h("number"), h("placed"), h("done"), h("status"), h("source"), h("customer"), h("phone"), h("email"),
    h("area"), h("governorate"), h("address"), h("delivery"), h("method"), h("bank"), h("promo"), h("items"),
    h("subtotal"), h("discount"), h("deliveryFee"), h("total"), h("paymentId"), h("tranId"), h("ref"), h("auth"),
  ];

  const ordersData: XlsxCell[][] = [ordersHeader];
  for (const item of rows) {
    const o = item.order;
    const area = areaById(o.details.areaId);
    const bank = item.receiptAttempt?.bankId ? banks.find((b) => b.id === item.receiptAttempt?.bankId) : undefined;
    const attempt = item.receiptAttempt;
    const itemsCount = o.lines.reduce((n, l) => n + l.qty, 0);
    ordersData.push([
      text(o.id),
      dateCell(item.placedAt),
      dateCell(item.doneAt),
      label(t(`orders.status.${statusKind(item)}`)),
      label(t(`orders.source.${item.source}`)),
      label(o.details.name),
      text(o.details.phone),
      text(o.details.email),
      label(area ? area.name[locale] : ""),
      label(area ? governorates[area.governorate][locale] : ""),
      label(addressLine(o, t)),
      label(t(`orders.delivery.${o.details.deliveryMethod}`)),
      label(t(`orders.method.${o.method}`)),
      label(bank ? bank.name[locale] : ""),
      text(o.promoCode ?? ""),
      count(itemsCount),
      money(o.totals.subtotalFils),
      money(o.totals.discountFils),
      money(o.totals.deliveryFils),
      money(o.totals.totalFils),
      text(attempt?.paymentId ?? ""),
      text(attempt?.tranId ?? ""),
      text(attempt?.ref ?? ""),
      text(attempt?.auth ?? ""),
    ]);
  }

  const ordersColumns = [
    { width: 12 }, { width: 17 }, { width: 17 }, { width: 13 }, { width: 10 }, { width: 22 }, { width: 13 }, { width: 24 },
    { width: 16 }, { width: 18 }, { width: 34 }, { width: 11 }, { width: 11 }, { width: 24 }, { width: 10 }, { width: 7 },
    { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 22 }, { width: 18 }, { width: 16 }, { width: 10 },
  ];

  // ── Items sheet ────────────────────────────────────────────────────────────
  const itemsData: XlsxCell[][] = [
    [
      header(t("orders.export.items.number")),
      header(t("orders.export.items.product")),
      header(t("orders.export.items.size")),
      header(t("orders.export.items.sku")),
      header(t("orders.export.items.qty")),
      header(t("orders.export.items.unitPrice")),
      header(t("orders.export.items.lineTotal")),
    ],
  ];
  for (const item of rows) {
    for (const line of item.order.lines) {
      itemsData.push([
        text(item.order.id),
        label(line.name),
        label(line.size[locale]),
        text(line.sku),
        count(line.qty),
        money(line.priceFils),
        money(line.priceFils * line.qty),
      ]);
    }
  }
  const itemsColumns = [{ width: 12 }, { width: 22 }, { width: 16 }, { width: 18 }, { width: 7 }, { width: 12 }, { width: 12 }];

  // ── Summary sheet ──────────────────────────────────────────────────────────
  const rangeLabel =
    filters.range === "custom"
      ? [filters.from, filters.to].filter(Boolean).join(" → ") || t("filters.range.custom")
      : t(`filters.range.${filters.range}`);

  const summaryData: XlsxCell[][] = [
    [header(t("orders.export.summary.field")), header(t("orders.export.summary.value"))],
    [label(t("kpi.revenue.label")), money(kpis.revenueFils)],
    [label(t("kpi.revenue.products")), money(kpis.productsFils)],
    [label(t("kpi.revenue.delivery")), money(kpis.deliveryFils)],
    [label(t("kpi.completed.label")), count(kpis.completedCount)],
    [label(t("kpi.pending.label")), count(kpis.pendingCount)],
    [label(t("kpi.pending.value")), money(kpis.pendingValueFils)],
    [label(t("kpi.average.label")), money(kpis.averageFils)],
    [null, null],
    [label(t("orders.export.summary.filters")), null],
    [label(t("filters.rangeLabel")), label(rangeLabel)],
    [label(t("filters.fulfillmentLabel")), label(t(`filters.fulfillment.${filters.fulfillment}`))],
    [label(t("filters.methodLabel")), label(t(`filters.method.${filters.method}`))],
    [label(t("filters.deliveryLabel")), label(t(`filters.delivery.${filters.delivery}`))],
    [label(t("filters.sourceLabel")), label(t(`filters.source.${filters.source}`))],
    [label(t("filters.searchLabel")), text(filters.query)],
    [label(t("orders.export.summary.generated")), dateCell(now.toISOString())],
    [label(t("orders.export.summary.rows")), count(rows.length)],
  ];
  const summaryColumns = [{ width: 24 }, { width: 28 }];

  return [
    {
      data: ordersData,
      sheet: sheetName(t("orders.export.sheets.orders")),
      columns: ordersColumns,
      stickyRowsCount: 1,
      rightToLeft: rtl,
    },
    {
      data: itemsData,
      sheet: sheetName(t("orders.export.sheets.items")),
      columns: itemsColumns,
      stickyRowsCount: 1,
      rightToLeft: rtl,
    },
    {
      data: summaryData,
      sheet: sheetName(t("orders.export.sheets.summary")),
      columns: summaryColumns,
      stickyRowsCount: 1,
      rightToLeft: rtl,
    },
  ];
}

/** mystic-sand-orders-YYYY-MM-DD.xlsx using the Kuwait calendar date. */
export function ordersFileName(now: Date): string {
  const c = kuwaitClock(now);
  const date = `${c.year}-${String(c.month).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`;
  return `mystic-sand-orders-${date}.xlsx`;
}
