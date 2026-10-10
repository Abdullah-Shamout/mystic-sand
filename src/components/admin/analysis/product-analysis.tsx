"use client";

import { FileDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { SelectInput, TextInput } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import type { CategorySlug } from "@/data/types";
import type { Locale } from "@/i18n/routing";
import {
  analyzeProducts,
  defaultAnalysisFilters,
  type AnalysisFilters,
  type RemovedStat,
} from "@/lib/admin/analytics";
import { collectOrders, type RangeFilter, type SourceFilter } from "@/lib/admin/orders";
import { useLiveCatalog } from "@/lib/live";
import { useMounted, useNow } from "@/lib/hooks";
import { useAdminStore } from "@/store/admin";
import { useCheckout } from "@/store/checkout";
import { useStockStore } from "@/store/stock";
import { useUi } from "@/store/ui";
import { KpiTile } from "../kpi-tile";
import { CategorySectionView } from "./category-section";

const RANGES: readonly RangeFilter[] = ["today", "7d", "30d", "month", "all", "custom"];
const SOURCES: readonly SourceFilter[] = ["all", "site", "sample"];

/** An LTR-isolated integer. */
function Num({ value }: { value: number }) {
  return (
    <bdi dir="ltr" className="figures">
      {value}
    </bdi>
  );
}

function RemovedSection({ removed }: { removed: RemovedStat[] }) {
  const t = useTranslations("admin");
  return (
    <section data-testid="analysis-removed" className="min-w-0">
      <div className="border-b border-line pb-3">
        <h2 className="caps font-serif text-[22px] font-medium">{t("analysis.removedTitle")}</h2>
        <p className="mt-1 text-[13px] text-muted">{t("analysis.removedIntro")}</p>
      </div>
      <div className="mt-4 overflow-x-auto border border-line">
        <table className="w-full min-w-[480px] border-collapse text-[14px]">
          <thead className="border-b border-line bg-tile">
            <tr>
              <th scope="col" className="caps px-3 py-2.5 text-start text-[12px] font-medium text-muted">
                {t("analysis.col.product")}
              </th>
              <th scope="col" className="caps px-3 py-2.5 text-start text-[12px] font-medium text-muted">
                {t("analysis.col.units")}
              </th>
              <th scope="col" className="caps px-3 py-2.5 text-start text-[12px] font-medium text-muted">
                {t("analysis.col.orders")}
              </th>
              <th scope="col" className="caps px-3 py-2.5 text-end text-[12px] font-medium text-muted">
                {t("analysis.col.revenue")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {removed.map((r) => (
              <tr key={r.slug} data-testid="analysis-removed-row" data-slug={r.slug} data-units={r.units} className="align-top">
                <td className="px-3 py-3">
                  <bdi>{r.name}</bdi>
                  <span className="ms-2 text-[11px] text-muted">
                    <bdi dir="ltr">{r.slug}</bdi>
                  </span>
                </td>
                <td className="px-3 py-3 text-muted">
                  <Num value={r.units} />
                </td>
                <td className="px-3 py-3 text-muted">
                  <Num value={r.orders} />
                </td>
                <td className="px-3 py-3 text-end">
                  <Price fils={r.revenueFils} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ProductAnalysis() {
  const t = useTranslations("admin");
  const locale = useLocale() as Locale;
  const mounted = useMounted();
  const now = useNow();
  const pushToast = useUi((s) => s.pushToast);

  const catalog = useLiveCatalog();
  const sold = useStockStore((s) => s.sold);
  const siteOrdersMap = useCheckout((s) => s.orders);
  const samples = useAdminStore((s) => s.samples);
  const fulfillment = useAdminStore((s) => s.fulfillment);

  const [filters, setFilters] = useState<AnalysisFilters>(() => ({ ...defaultAnalysisFilters }));
  const [exporting, setExporting] = useState<string | null>(null);

  const allOrders = useMemo(
    () => collectOrders(Object.values(siteOrdersMap), samples, fulfillment),
    [siteOrdersMap, samples, fulfillment],
  );

  const analysis = useMemo(
    () => (now ? analyzeProducts({ orders: allOrders, catalog, sold, filters, locale, now }) : null),
    [now, allOrders, catalog, sold, filters, locale],
  );

  const catNames = useCallback(
    (slugs: string[]): string =>
      slugs
        .map((slug) => catalog.categories.find((c) => c.slug === slug)?.name[locale] ?? slug)
        .join(locale === "ar" ? "، " : ", "),
    [catalog.categories, locale],
  );

  const set = (patch: Partial<AnalysisFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const onExportCategory = useCallback(
    async (slug: CategorySlug) => {
      if (!now || !analysis) return;
      const section = analysis.sections.find((s) => s.slug === slug);
      if (!section) return;
      setExporting(slug);
      try {
        const { exportCategory } = await import("@/lib/admin/excel-writer");
        await exportCategory({ section, filters, locale, now });
      } catch {
        pushToast({ title: t("analysis.exportError") });
      } finally {
        setExporting(null);
      }
    },
    [now, analysis, filters, locale, pushToast, t],
  );

  const onExportAll = useCallback(async () => {
    if (!now || !analysis) return;
    setExporting("all");
    try {
      const { exportAllCategories } = await import("@/lib/admin/excel-writer");
      await exportAllCategories({ analysis, filters, locale, now });
    } catch {
      pushToast({ title: t("analysis.exportError") });
    } finally {
      setExporting(null);
    }
  }, [now, analysis, filters, locale, pushToast, t]);

  if (!mounted || !now || !analysis) return <AnalysisSkeleton />;

  const periodLabel =
    filters.range === "custom"
      ? [filters.from, filters.to].filter(Boolean).join(" → ") || t("filters.range.custom")
      : t(`filters.range.${filters.range}`);

  const { summary } = analysis;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="caps font-serif text-title font-medium">{t("analysis.title")}</h1>
          <p className="mt-1 text-[13px] text-muted">
            {periodLabel} · {t("analysis.note")}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onExportAll}
          busy={exporting === "all"}
          data-testid="analysis-export-all"
        >
          <FileDown className="size-4" strokeWidth={1.5} aria-hidden />
          {exporting === "all" ? t("analysis.exporting") : t("analysis.exportAll")}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          testId="kpi-analysis-units"
          label={t("analysis.summary.units")}
          period={periodLabel}
          value={<Num value={summary.units} />}
        />
        <KpiTile
          testId="kpi-analysis-orders"
          label={t("analysis.summary.orders")}
          period={periodLabel}
          value={<Num value={summary.orders} />}
        />
        <KpiTile
          testId="kpi-analysis-revenue"
          label={t("analysis.summary.revenue")}
          period={periodLabel}
          value={<Price fils={summary.revenueFils} />}
        />
        <KpiTile
          testId="kpi-analysis-best"
          label={t("analysis.summary.best")}
          period={periodLabel}
          value={
            summary.bestSeller ? (
              <span className="flex items-baseline gap-2">
                <bdi lang="en">{summary.bestSeller.name}</bdi>
                <span className="text-[13px] font-normal text-muted">
                  <Num value={summary.bestSeller.units} /> {t("analysis.unitsLabel")}
                </span>
              </span>
            ) : (
              t("analysis.summary.noBest")
            )
          }
        />
      </div>

      <div className="grid gap-3 border border-line bg-paper p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-end">
        <div>
          <label htmlFor="analysis-search" className="caps mb-1.5 block text-[12px] text-muted">
            {t("analysis.searchLabel")}
          </label>
          <TextInput
            id="analysis-search"
            type="search"
            value={filters.query}
            placeholder={t("analysis.searchPlaceholder")}
            onChange={(e) => set({ query: e.target.value })}
            data-testid="analysis-search"
          />
        </div>
        <div>
          <label htmlFor="analysis-range" className="caps mb-1.5 block text-[12px] text-muted">
            {t("analysis.periodLabel")}
          </label>
          <SelectInput
            id="analysis-range"
            value={filters.range}
            onChange={(e) => set({ range: e.target.value as RangeFilter })}
            className="lg:w-40"
          >
            {RANGES.map((r) => (
              <option key={r} value={r}>
                {t(`filters.range.${r}`)}
              </option>
            ))}
          </SelectInput>
        </div>
        <div>
          <label htmlFor="analysis-source" className="caps mb-1.5 block text-[12px] text-muted">
            {t("analysis.sourceLabel")}
          </label>
          <SelectInput
            id="analysis-source"
            value={filters.source}
            onChange={(e) => set({ source: e.target.value as SourceFilter })}
            className="lg:w-36"
          >
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {t(`filters.source.${s}`)}
              </option>
            ))}
          </SelectInput>
        </div>
        <label className="caps flex min-h-12 cursor-pointer items-center gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            checked={filters.completedOnly}
            onChange={(e) => set({ completedOnly: e.target.checked })}
            className="size-[18px] accent-racing"
            data-testid="analysis-completed"
          />
          {t("analysis.completedOnly")}
        </label>

        {filters.range === "custom" && (
          <div className="grid gap-3 sm:grid-cols-2 lg:col-span-4">
            <div>
              <label htmlFor="analysis-from" className="caps mb-1.5 block text-[12px] text-muted">
                {t("filters.from")}
              </label>
              <TextInput
                id="analysis-from"
                type="date"
                value={filters.from ?? ""}
                onChange={(e) => set({ from: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="analysis-to" className="caps mb-1.5 block text-[12px] text-muted">
                {t("filters.to")}
              </label>
              <TextInput
                id="analysis-to"
                type="date"
                value={filters.to ?? ""}
                onChange={(e) => set({ to: e.target.value })}
              />
            </div>
          </div>
        )}
      </div>

      {analysis.hasRows ? (
        <div className="space-y-12">
          {analysis.sections.map((section) => (
            <CategorySectionView
              key={section.slug}
              section={section}
              catNames={catNames}
              onExport={() => onExportCategory(section.slug)}
              exporting={exporting === section.slug}
            />
          ))}
          {analysis.removed.length > 0 && <RemovedSection removed={analysis.removed} />}
        </div>
      ) : (
        <p className="border border-line bg-paper px-4 py-16 text-center text-[15px] text-muted" data-testid="analysis-empty">
          {t("analysis.empty")}
        </p>
      )}
    </div>
  );
}

function AnalysisSkeleton() {
  return (
    <div className="space-y-8" aria-busy>
      <Skeleton className="h-9 w-56" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
