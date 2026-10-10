import { toLatinDigits } from "@/lib/digits";
import { kuwaitClock } from "@/lib/delivery";
import type { PaymentRecord } from "@/lib/payments/types";
import { normalizeSearch } from "@/lib/search";
import type { FulfillmentMap } from "@/store/admin";
import type { Order } from "@/store/checkout";

// Pure, React-free logic for the orders dashboard: joining site + sample orders, filtering,
// searching and the KPI roll-up. "Now" is always passed in (never read here).

const DAY = 24 * 60 * 60 * 1000;

export type OrderSource = "site" | "sample";

export type AdminOrder = {
  order: Order;
  source: OrderSource;
  /** True for paid and confirming orders (a confirming order is paid-pending, shown as Pending). */
  paid: boolean;
  fulfillment: "pending" | "done";
  doneAt: string | null;
  /** The attempt a receipt is built from: last CAPTURED, else the last attempt (or null). */
  receiptAttempt: PaymentRecord | null;
  placedAt: string;
};

// Only paid (and still-confirming) orders are listed, and the only states are the fulfilment ones.
export type StatusKind = "done" | "pending";

/** The status shown as a chip: Done once fulfilled, otherwise Pending (confirming counts as pending). */
export function statusKind(item: AdminOrder): StatusKind {
  return item.fulfillment === "done" ? "done" : "pending";
}

export type FulfillmentFilter = "all" | "pending" | "done";
export type RangeFilter = "today" | "7d" | "30d" | "month" | "all" | "custom";
export type MethodFilter = "all" | "knet" | "applepay" | "card";
export type SourceFilter = "all" | "site" | "sample";

export type Filters = {
  query: string;
  fulfillment: FulfillmentFilter;
  range: RangeFilter;
  from?: string;
  to?: string;
  method: MethodFilter;
  source: SourceFilter;
};

export const defaultFilters: Filters = {
  query: "",
  fulfillment: "all",
  range: "all",
  method: "all",
  source: "all",
};

function receiptAttemptFor(order: Order): PaymentRecord | null {
  const attempts = order.attempts ?? [];
  for (let i = attempts.length - 1; i >= 0; i--) if (attempts[i].result === "CAPTURED") return attempts[i];
  return attempts.length > 0 ? attempts[attempts.length - 1] : null;
}

function toAdminOrder(order: Order, source: OrderSource, fulfillment: FulfillmentMap): AdminOrder {
  const paid = order.status === "paid" || order.status === "confirming";
  // Paid and confirming orders alike can be marked done.
  const done = paid && Boolean(fulfillment[order.id]);
  return {
    order,
    source,
    paid,
    fulfillment: done ? "done" : "pending",
    doneAt: done ? (fulfillment[order.id]?.doneAt ?? null) : null,
    receiptAttempt: receiptAttemptFor(order),
    placedAt: order.createdAt,
  };
}

/**
 * Site orders plus the sample orders. Site orders are `paid` only when their status is paid or
 * confirming; abandoned checkouts (pending/failed/canceled) are carried through but filtered out
 * of the dashboard by applyFilters (only paid/confirming orders are ever listed).
 */
export function collectOrders(
  siteOrders: Order[],
  samples: Order[],
  fulfillment: FulfillmentMap,
): AdminOrder[] {
  const site = siteOrders.map((o) => toAdminOrder(o, "site", fulfillment));
  const sample = samples.map((o) => toAdminOrder(o, "sample", fulfillment));
  return [...site, ...sample];
}

/** A Kuwait-time day number (days since the epoch, UTC+3), for bucketing by calendar day. */
function kuwaitDayOrdinal(iso: string): number {
  const c = kuwaitClock(new Date(iso));
  return Math.floor(Date.UTC(c.year, c.month - 1, c.day) / DAY);
}

/** A "yyyy-mm-dd" date-input value as a day number. Returns null when unparseable. */
function inputDayOrdinal(value: string | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY);
}

/**
 * Kuwait-day range test shared by the orders dashboard and the product analysis page, so both
 * read "today / last 7 / last 30 / this month / all / custom" the same way. "Now" is passed in.
 */
export function inDateRange(
  placedAt: string,
  range: RangeFilter,
  from: string | undefined,
  to: string | undefined,
  now: Date,
): boolean {
  if (range === "all") return true;
  const nowC = kuwaitClock(now);
  const day = kuwaitDayOrdinal(placedAt);
  const nowDay = Math.floor(Date.UTC(nowC.year, nowC.month - 1, nowC.day) / DAY);

  switch (range) {
    case "today":
      return day === nowDay;
    case "7d":
      return day <= nowDay && day > nowDay - 7;
    case "30d":
      return day <= nowDay && day > nowDay - 30;
    case "month": {
      const c = kuwaitClock(new Date(placedAt));
      return c.year === nowC.year && c.month === nowC.month;
    }
    case "custom": {
      const f = inputDayOrdinal(from);
      const tt = inputDayOrdinal(to);
      if (f !== null && day < f) return false;
      if (tt !== null && day > tt) return false;
      return true;
    }
    default:
      return true;
  }
}

function inRange(placedAt: string, filters: Filters, now: Date): boolean {
  return inDateRange(placedAt, filters.range, filters.from, filters.to, now);
}

/** Customer name (normalised), order number and phone (Latin digits) all match the query. */
export function matchesQuery(order: Order, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  const name = normalizeSearch(order.details.name);
  const number = normalizeSearch(order.id);
  const phone = toLatinDigits(order.details.phone);
  return name.includes(q) || number.includes(q) || phone.includes(q);
}

export function applyFilters(list: AdminOrder[], filters: Filters, now: Date): AdminOrder[] {
  return list.filter((item) => {
    // Only paid (and still-confirming) orders are ever listed; abandoned checkouts never appear.
    if (!item.paid) return false;
    if (filters.source !== "all" && item.source !== filters.source) return false;
    if (filters.fulfillment === "pending" && item.fulfillment !== "pending") return false;
    if (filters.fulfillment === "done" && item.fulfillment !== "done") return false;
    if (filters.method !== "all" && item.order.method !== filters.method) return false;
    if (!inRange(item.placedAt, filters, now)) return false;
    if (!matchesQuery(item.order, filters.query)) return false;
    return true;
  });
}

export type Kpis = {
  revenueFils: number;
  productsFils: number;
  deliveryFils: number;
  completedCount: number;
  pendingCount: number;
  pendingValueFils: number;
  averageFils: number;
};

/** Over PAID orders: revenue (and its split) counts DONE orders; pending counts the rest. */
export function computeKpis(list: AdminOrder[]): Kpis {
  let revenueFils = 0;
  let productsFils = 0;
  let deliveryFils = 0;
  let completedCount = 0;
  let pendingCount = 0;
  let pendingValueFils = 0;

  for (const item of list) {
    if (!item.paid) continue;
    const t = item.order.totals;
    if (item.fulfillment === "done") {
      completedCount += 1;
      revenueFils += t.totalFils;
      productsFils += t.subtotalFils - t.discountFils;
      deliveryFils += t.deliveryFils;
    } else {
      pendingCount += 1;
      pendingValueFils += t.totalFils;
    }
  }

  return {
    revenueFils,
    productsFils,
    deliveryFils,
    completedCount,
    pendingCount,
    pendingValueFils,
    averageFils: completedCount > 0 ? Math.round(revenueFils / completedCount) : 0,
  };
}

export type SortKey = "date" | "total";
export type SortDir = "asc" | "desc";

export function sortOrders(list: AdminOrder[], sort: { key: SortKey; dir: SortDir }): AdminOrder[] {
  const factor = sort.dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const cmp =
      sort.key === "total"
        ? a.order.totals.totalFils - b.order.totals.totalFils
        : new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime();
    return cmp * factor;
  });
}
