"use client";

import { FileDown, SlidersHorizontal } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Price } from "@/components/ui/price";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import {
  applyFilters,
  collectOrders,
  computeKpis,
  defaultFilters,
  sortOrders,
  type Filters,
  type SortDir,
  type SortKey,
} from "@/lib/admin/orders";
import { useMounted, useNow } from "@/lib/hooks";
import { formatKWD } from "@/lib/money";
import { useAdminStore } from "@/store/admin";
import { useCheckout } from "@/store/checkout";
import { useUi } from "@/store/ui";
import { KpiTile } from "../kpi-tile";
import { OrderCards } from "./order-cards";
import { OrderDrawer } from "./order-drawer";
import { OrdersFilters } from "./orders-filters";
import { OrdersTable } from "./orders-table";

const PAGE = 25;

export function OrdersDashboard() {
  const t = useTranslations("admin");
  const locale = useLocale() as Locale;
  const mounted = useMounted();
  const now = useNow();
  const announce = useUi((s) => s.announce);
  const pushToast = useUi((s) => s.pushToast);
  const search = useSearchParams();

  const siteOrdersMap = useCheckout((s) => s.orders);
  const samples = useAdminStore((s) => s.samples);
  const fulfillment = useAdminStore((s) => s.fulfillment);

  const [filters, setFilters] = useState<Filters>(() => ({ ...defaultFilters }));
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "date", dir: "desc" });
  const [limit, setLimit] = useState(PAGE);
  const [openId, setOpenId] = useState<string | null>(() => search.get("order"));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const allOrders = useMemo(
    () => collectOrders(Object.values(siteOrdersMap), samples, fulfillment),
    [siteOrdersMap, samples, fulfillment],
  );

  const kpiList = useMemo(
    () => (now ? applyFilters(allOrders, { ...filters, fulfillment: "all" }, now) : []),
    [allOrders, filters, now],
  );
  const kpis = useMemo(() => computeKpis(kpiList), [kpiList]);

  const filtered = useMemo(() => (now ? applyFilters(allOrders, filters, now) : []), [allOrders, filters, now]);
  const sorted = useMemo(() => sortOrders(filtered, sort), [filtered, sort]);
  const visible = useMemo(() => sorted.slice(0, limit), [sorted, limit]);

  const openOrder = useMemo(
    () => (openId ? (allOrders.find((o) => o.order.id === openId) ?? null) : null),
    [openId, allOrders],
  );

  const updateFilters = (next: Filters) => {
    setFilters(next);
    setLimit(PAGE);
  };
  const updateSort = (next: { key: SortKey; dir: SortDir }) => {
    setSort(next);
    setLimit(PAGE);
  };

  const setOpen = useCallback((id: string | null) => {
    setOpenId(id);
    try {
      const url = new URL(window.location.href);
      if (id) url.searchParams.set("order", id);
      else url.searchParams.delete("order");
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // history blocked — the drawer still opens from state
    }
  }, []);

  // Announce the result count, but only when it actually changes.
  const prevCount = useRef<number | null>(null);
  useEffect(() => {
    if (!now) return;
    if (prevCount.current === filtered.length) return;
    prevCount.current = filtered.length;
    announce(t("orders.resultsCount", { count: filtered.length }));
  }, [filtered.length, now, announce, t]);

  const onExport = useCallback(async () => {
    if (!now) return;
    setExporting(true);
    try {
      const { exportOrders } = await import("@/lib/admin/excel-writer");
      await exportOrders({ rows: sorted, kpis, filters, locale, now });
    } catch {
      pushToast({ title: t("orders.exportError") });
    } finally {
      setExporting(false);
    }
  }, [now, sorted, kpis, filters, locale, pushToast, t]);

  if (!mounted || !now) return <DashboardSkeleton />;

  const periodLabel =
    filters.range === "custom"
      ? [filters.from, filters.to].filter(Boolean).join(" → ") || t("filters.range.custom")
      : t(`filters.range.${filters.range}`);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h1 className="caps font-serif text-title font-medium">{t("orders.title")}</h1>
          <span className="text-[14px] text-muted" data-testid="orders-count">
            {t("orders.resultsCount", { count: filtered.length })}
          </span>
        </div>
        <Button variant="secondary" size="sm" onClick={onExport} busy={exporting} data-testid="orders-export">
          <FileDown className="size-4" strokeWidth={1.5} aria-hidden />
          {exporting ? t("orders.exporting") : t("orders.exportButton")}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          testId="kpi-revenue"
          label={t("kpi.revenue.label")}
          period={periodLabel}
          value={<Price fils={kpis.revenueFils} />}
          sub={
            <span>
              {t("kpi.revenue.products")} <Price fils={kpis.productsFils} /> · {t("kpi.revenue.delivery")}{" "}
              <Price fils={kpis.deliveryFils} />
            </span>
          }
        />
        <KpiTile testId="kpi-completed" label={t("kpi.completed.label")} period={periodLabel} value={kpis.completedCount} />
        <KpiTile
          testId="kpi-pending"
          label={t("kpi.pending.label")}
          period={periodLabel}
          value={kpis.pendingCount}
          sub={t("kpi.pending.value", { value: formatKWD(kpis.pendingValueFils, locale) })}
        />
        <KpiTile
          testId="kpi-average"
          label={t("kpi.average.label")}
          period={periodLabel}
          value={<Price fils={kpis.averageFils} />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 border border-line bg-paper p-4">
            <OrdersFilters value={filters} onChange={updateFilters} />
          </div>
        </aside>

        <div className="min-w-0">
          <div className="mb-4 lg:hidden">
            <Button variant="secondary" size="sm" onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal className="size-4" strokeWidth={1.5} aria-hidden />
              {t("orders.filtersButton")}
            </Button>
          </div>

          {sorted.length === 0 ? (
            <p className="border border-line bg-paper px-4 py-16 text-center text-[15px] text-muted">
              {t("orders.empty")}
            </p>
          ) : (
            <>
              <div className="hidden md:block">
                <OrdersTable rows={visible} sort={sort} onSortChange={updateSort} onOpen={setOpen} />
              </div>
              <div className="md:hidden">
                <OrderCards rows={visible} onOpen={setOpen} />
              </div>

              {visible.length < sorted.length && (
                <div className="mt-6 text-center">
                  <Button variant="secondary" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                    {t("orders.showMore")}
                  </Button>
                  <p className="mt-2 text-[12px] text-muted">
                    {t("orders.showing", { shown: visible.length, total: sorted.length })}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Drawer
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title={t("orders.filtersButton")}
        footer={
          <div className="px-6 py-4">
            <Button block onClick={() => setFiltersOpen(false)}>
              {t("filters.done")}
            </Button>
          </div>
        }
      >
        <div className="px-6 py-6">
          <OrdersFilters value={filters} onChange={updateFilters} />
        </div>
      </Drawer>

      <OrderDrawer item={openOrder} onClose={() => setOpen(null)} />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-busy>
      <Skeleton className="h-9 w-48" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
