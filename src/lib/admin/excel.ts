import { createTranslator } from "next-intl";
import { banks } from "@/data/banks";
import { areaById, governorates } from "@/data/kuwait-areas";
import type { Locale } from "@/i18n/routing";
import { kuwaitClock } from "@/lib/delivery";
import { formatAmount } from "@/lib/money";
import type { AnalysisFilters, CategorySection, ProductAnalysis, ProductStat } from "./analytics";
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
    h("area"), h("governorate"), h("address"), h("method"), h("bank"), h("promo"), h("items"),
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
    { width: 16 }, { width: 18 }, { width: 34 }, { width: 11 }, { width: 24 }, { width: 10 }, { width: 7 },
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

/** The Kuwait calendar date as YYYY-MM-DD, for file names. */
function kuwaitDate(now: Date): string {
  const c = kuwaitClock(now);
  return `${c.year}-${String(c.month).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`;
}

/** mystic-sand-orders-YYYY-MM-DD.xlsx using the Kuwait calendar date. */
export function ordersFileName(now: Date): string {
  return `mystic-sand-orders-${kuwaitDate(now)}.xlsx`;
}

// ── Product analysis export ────────────────────────────────────────────────────

const bool = (value: boolean): XlsxCell => ({ value, type: Boolean });

/** A single price as a KWD number, or a text "min – max" range when a product has several sizes. */
function priceCell(min: number, max: number): XlsxCell {
  if (min === max) return money(min);
  return { value: `${formatAmount(min)} – ${formatAmount(max)}`, type: String, format: "@" };
}

/** A string-keyed admin translator for the given locale (keys are built dynamically). */
function adminTranslator(locale: Locale): (key: string) => string {
  const messages = locale === "ar" ? arMessages : enMessages;
  const translator = createTranslator({
    locale,
    messages: { admin: messages },
    namespace: "admin",
    timeZone: "Asia/Kuwait",
  });
  return translator as unknown as (key: string) => string;
}

/** Header row + one row per product for a category / all-products sheet. */
function productRows(
  stats: ProductStat[],
  t: (key: string) => string,
  locale: Locale,
  categoryNameOf?: (stat: ProductStat) => string,
): { data: XlsxCell[][]; columns: Array<{ width?: number }> } {
  const c = (key: string) => header(t(`analysis.col.${key}`));
  const withCategories = Boolean(categoryNameOf);
  const head: XlsxCell[] = [
    c("product"),
    c("type"),
    ...(withCategories ? [c("categories")] : []),
    c("sku"),
    c("price"),
    c("stock"),
    c("units"),
    c("orders"),
    c("revenue"),
    c("hidden"),
    c("custom"),
  ];
  const data: XlsxCell[][] = [head];
  for (const s of stats) {
    data.push([
      label(s.name),
      label(s.type[locale]),
      ...(categoryNameOf ? [label(categoryNameOf(s))] : []),
      text(s.skus.join(", ")),
      priceCell(s.priceMinFils, s.priceMaxFils),
      count(s.stock),
      count(s.units),
      count(s.orders),
      money(s.revenueFils),
      bool(s.hidden),
      bool(s.custom),
    ]);
  }
  const columns = [
    { width: 24 },
    { width: 20 },
    ...(withCategories ? [{ width: 22 }] : []),
    { width: 22 },
    { width: 14 },
    { width: 9 },
    { width: 13 },
    { width: 9 },
    { width: 12 },
    { width: 9 },
    { width: 9 },
  ];
  return { data, columns };
}

/** The per-size sheet (one row per SKU across the given products). */
function sizesSheet(stats: ProductStat[], t: (key: string) => string, locale: Locale): XlsxSheet {
  const data: XlsxCell[][] = [
    [
      header(t("analysis.col.product")),
      header(t("analysis.col.size")),
      header(t("analysis.col.sku")),
      header(t("analysis.col.units")),
      header(t("analysis.col.revenue")),
    ],
  ];
  const seen = new Set<string>();
  for (const s of stats) {
    if (seen.has(s.slug)) continue;
    seen.add(s.slug);
    for (const size of s.sizes) {
      data.push([label(s.name), label(size.size[locale]), text(size.sku), count(size.units), money(size.revenueFils)]);
    }
  }
  return {
    data,
    sheet: sheetName(t("analysis.export.sheets.sizes")),
    columns: [{ width: 24 }, { width: 18 }, { width: 22 }, { width: 13 }, { width: 12 }],
    stickyRowsCount: 1,
    rightToLeft: locale === "ar",
  };
}

function filterRows(filters: AnalysisFilters, now: Date, t: (key: string) => string): XlsxCell[][] {
  const rangeLabel =
    filters.range === "custom"
      ? [filters.from, filters.to].filter(Boolean).join(" → ") || t("filters.range.custom")
      : t(`filters.range.${filters.range}`);
  return [
    [label(t("analysis.export.summary.filters")), null],
    [label(t("filters.rangeLabel")), label(rangeLabel)],
    [label(t("filters.sourceLabel")), label(t(`filters.source.${filters.source}`))],
    [label(t("analysis.completedOnly")), label(t(filters.completedOnly ? "analysis.export.yes" : "analysis.export.no"))],
    [label(t("filters.searchLabel")), text(filters.query)],
    [label(t("analysis.export.summary.generated")), dateCell(now.toISOString())],
  ];
}

/** Per-category workbook: the category sheet plus a per-size sheet, honouring the current search. */
export function buildCategoryExport(input: {
  section: CategorySection;
  filters: AnalysisFilters;
  locale: Locale;
  now: Date;
}): XlsxSheet[] {
  const { section, filters, locale, now } = input;
  const t = adminTranslator(locale);
  const rtl = locale === "ar";
  const { data, columns } = productRows(section.products, t, locale);
  return [
    {
      data,
      sheet: sheetName(section.name[locale]),
      columns,
      stickyRowsCount: 1,
      rightToLeft: rtl,
    },
    sizesSheet(section.products, t, locale),
    {
      data: filterRows(filters, now, t),
      sheet: sheetName(t("analysis.export.sheets.summary")),
      columns: [{ width: 24 }, { width: 28 }],
      rightToLeft: rtl,
    },
  ];
}

/** All-collections workbook: Summary · one sheet per category · All products (each product once). */
export function buildAllCategoriesExport(input: {
  analysis: ProductAnalysis;
  filters: AnalysisFilters;
  locale: Locale;
  now: Date;
}): XlsxSheet[] {
  const { analysis, filters, locale, now } = input;
  const t = adminTranslator(locale);
  const rtl = locale === "ar";
  const nameBySlug = new Map(analysis.sections.map((s) => [s.slug, s.name[locale]]));
  const categoryNameOf = (stat: ProductStat): string =>
    [stat.category, ...stat.alsoIn].map((c) => nameBySlug.get(c) ?? c).join(", ");

  // ── Summary sheet ────────────────────────────────────────────────────────────
  const { summary } = analysis;
  const summaryData: XlsxCell[][] = [
    [header(t("analysis.export.summary.field")), header(t("analysis.export.summary.value"))],
    [label(t("analysis.summary.units")), count(summary.units)],
    [label(t("analysis.summary.orders")), count(summary.orders)],
    [label(t("analysis.summary.revenue")), money(summary.revenueFils)],
    [
      label(t("analysis.summary.best")),
      label(summary.bestSeller ? `${summary.bestSeller.name} (${summary.bestSeller.units})` : t("analysis.summary.noBest")),
    ],
    [null, null],
    [
      header(t("analysis.col.category")),
      header(t("analysis.col.units")),
      header(t("analysis.col.orders")),
      header(t("analysis.col.revenue")),
    ],
    ...analysis.sections.map((s) => [label(s.name[locale]), count(s.units), count(s.orders), money(s.revenueFils)]),
    [null, null],
    ...filterRows(filters, now, t),
  ];

  const categorySheets: XlsxSheet[] = analysis.sections.map((section) => {
    const { data, columns } = productRows(section.products, t, locale);
    return {
      data,
      sheet: sheetName(section.name[locale]),
      columns,
      stickyRowsCount: 1,
      rightToLeft: rtl,
    };
  });

  const all = productRows(analysis.products, t, locale, categoryNameOf);

  return [
    {
      data: summaryData,
      sheet: sheetName(t("analysis.export.sheets.summary")),
      columns: [{ width: 24 }, { width: 16 }, { width: 10 }, { width: 14 }],
      stickyRowsCount: 1,
      rightToLeft: rtl,
    },
    ...categorySheets,
    {
      data: all.data,
      sheet: sheetName(t("analysis.export.sheets.allProducts")),
      columns: all.columns,
      stickyRowsCount: 1,
      rightToLeft: rtl,
    },
  ];
}

/** mystic-sand-<category>-YYYY-MM-DD.xlsx (the slug keeps the name file-system safe). */
export function categoryFileName(slug: string, now: Date): string {
  return `mystic-sand-${slug}-${kuwaitDate(now)}.xlsx`;
}

/** mystic-sand-products-YYYY-MM-DD.xlsx for the all-collections export. */
export function analysisFileName(now: Date): string {
  return `mystic-sand-products-${kuwaitDate(now)}.xlsx`;
}

// ── Stock export ────────────────────────────────────────────────────────────────

/** One SKU's line in the stock sheet. Text fields are already localised by the caller. */
export type StockExportRow = {
  product: string;
  collection: string;
  size: string;
  sku: string;
  set: number;
  sold: number;
  available: number;
  status: string;
  hidden: boolean;
  custom: boolean;
};

/** A single sheet, one row per SKU: product, size, set value, sold, available and status. */
export function buildStockExport(input: { rows: StockExportRow[]; locale: Locale; now: Date }): XlsxSheet[] {
  const { rows, locale } = input;
  const t = adminTranslator(locale);
  const rtl = locale === "ar";
  const h = (key: string) => header(t(`stock.exportCol.${key}`));

  const data: XlsxCell[][] = [
    [h("product"), h("collection"), h("size"), h("sku"), h("set"), h("sold"), h("available"), h("status"), h("hidden"), h("custom")],
  ];
  for (const r of rows) {
    data.push([
      label(r.product),
      label(r.collection),
      label(r.size),
      text(r.sku),
      count(r.set),
      count(r.sold),
      count(r.available),
      label(r.status),
      bool(r.hidden),
      bool(r.custom),
    ]);
  }

  return [
    {
      data,
      sheet: sheetName(t("stock.exportSheet")),
      columns: [
        { width: 24 }, { width: 20 }, { width: 16 }, { width: 20 }, { width: 10 }, { width: 14 }, { width: 11 }, { width: 13 }, { width: 9 }, { width: 9 },
      ],
      stickyRowsCount: 1,
      rightToLeft: rtl,
    },
  ];
}

/** mystic-sand-stock-YYYY-MM-DD.xlsx using the Kuwait calendar date. */
export function stockFileName(now: Date): string {
  return `mystic-sand-stock-${kuwaitDate(now)}.xlsx`;
}
