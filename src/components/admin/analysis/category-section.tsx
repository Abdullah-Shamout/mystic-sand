"use client";

import { ChevronDown, FileDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Price } from "@/components/ui/price";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import type { Locale } from "@/i18n/routing";
import type { CategorySection as Section, ProductStat, SizeStat } from "@/lib/admin/analytics";
import { cn } from "@/lib/cn";

/** An LTR-isolated integer, so counts never reorder inside Arabic text. */
function Num({ value, className }: { value: number; className?: string }) {
  return (
    <bdi dir="ltr" className={cn("figures", className)}>
      {value}
    </bdi>
  );
}

/** A thin units bar, racing green, rounded only at the data end, with the figure beside it. */
function UnitsBar({ units, max }: { units: number; max: number }) {
  const pct = units <= 0 || max <= 0 ? 0 : Math.max(8, Math.round((units / max) * 100));
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-20 shrink-0 bg-tile sm:w-24" aria-hidden>
        <span className="block h-full rounded-e-full bg-racing" style={{ width: `${pct}%` }} />
      </span>
      <Num value={units} className="text-ink" />
    </span>
  );
}

function Flags({ stat }: { stat: ProductStat }) {
  const t = useTranslations("admin");
  return (
    <>
      {stat.hidden && (
        <span className="caps inline-flex items-center border border-line bg-tile px-1.5 py-0.5 text-[11px] text-muted whitespace-nowrap">
          {t("analysis.hidden")}
        </span>
      )}
      {stat.custom && (
        <span className="caps inline-flex items-center border border-racing/30 bg-racing/10 px-1.5 py-0.5 text-[11px] text-racing whitespace-nowrap">
          {t("analysis.custom")}
        </span>
      )}
    </>
  );
}

function SizeRows({ sizes }: { sizes: SizeStat[] }) {
  const locale = useLocale() as Locale;
  return (
    <ul className="space-y-1">
      {sizes.map((s) => (
        <li key={s.sku} className="flex items-center justify-between gap-4 text-[13px] text-muted">
          <span>
            <bdi>{s.size[locale]}</bdi>
          </span>
          <span className="flex items-center gap-4">
            <Num value={s.units} />
            <Price fils={s.revenueFils} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The collections this product is listed in other than the section it is being shown under. */
function otherCollections(stat: ProductStat, sectionSlug: string): string[] {
  return [stat.category, ...stat.alsoIn].filter((c) => c !== sectionSlug);
}

function ProductRow({
  stat,
  sectionSlug,
  max,
  catNames,
}: {
  stat: ProductStat;
  sectionSlug: string;
  max: number;
  catNames: (slugs: string[]) => string;
}) {
  const t = useTranslations("admin");
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(false);
  const canExpand = stat.sizes.length > 0 && stat.units > 0;
  const alsoIn = otherCollections(stat, sectionSlug);

  return (
    <>
      <tr data-testid="analysis-row" data-slug={stat.slug} data-units={stat.units} className="align-top hover:bg-tile/40">
        <td className="px-3 py-3">
          <div className="flex items-start gap-3">
            <div className="relative size-11 shrink-0 overflow-hidden border border-line bg-tile">
              <ResponsiveImage image={stat.image} alt="" sizes="44px" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="caps font-serif text-[16px] leading-tight font-medium">
                  <bdi lang="en">{stat.name}</bdi>
                </span>
                <Flags stat={stat} />
              </div>
              {alsoIn.length > 0 && (
                <p className="mt-0.5 text-[11px] text-muted">{t("analysis.alsoIn", { categories: catNames(alsoIn) })}</p>
              )}
            </div>
          </div>
        </td>
        <td className="px-3 py-3 text-[13px] text-muted">{stat.type[locale]}</td>
        <td className="px-3 py-3 whitespace-nowrap text-[13px]">
          {stat.priceMinFils === stat.priceMaxFils ? (
            <Price fils={stat.priceMinFils} />
          ) : (
            <bdi className="figures whitespace-nowrap">
              <Price fils={stat.priceMinFils} /> – <Price fils={stat.priceMaxFils} />
            </bdi>
          )}
        </td>
        <td className="px-3 py-3 text-[13px] text-muted">
          <Num value={stat.stock} />
        </td>
        <td className="px-3 py-3">
          <UnitsBar units={stat.units} max={max} />
        </td>
        <td className="px-3 py-3 text-[13px] text-muted">
          <Num value={stat.orders} />
        </td>
        <td className="px-3 py-3 text-end text-[13px]">
          <Price fils={stat.revenueFils} className="font-medium" />
        </td>
        <td className="px-3 py-3 text-end">
          {canExpand && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="caps inline-flex items-center gap-1 text-[12px] text-muted underline-offset-4 hover:text-ink"
            >
              {t(open ? "analysis.hideSizes" : "analysis.showSizes")}
              <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
            </button>
          )}
        </td>
      </tr>
      {canExpand && open && (
        <tr className="bg-tile/30">
          <td colSpan={8} className="px-3 pb-4 ps-20">
            <SizeRows sizes={stat.sizes} />
          </td>
        </tr>
      )}
    </>
  );
}

function ProductCard({
  stat,
  sectionSlug,
  max,
  catNames,
}: {
  stat: ProductStat;
  sectionSlug: string;
  max: number;
  catNames: (slugs: string[]) => string;
}) {
  const t = useTranslations("admin");
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(false);
  const canExpand = stat.sizes.length > 0 && stat.units > 0;
  const alsoIn = otherCollections(stat, sectionSlug);

  return (
    <li data-testid="analysis-card" data-slug={stat.slug} data-units={stat.units} className="border border-line bg-paper p-4">
      <div className="flex items-start gap-3">
        <div className="relative size-14 shrink-0 overflow-hidden border border-line bg-tile">
          <ResponsiveImage image={stat.image} alt="" sizes="56px" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="caps font-serif text-[17px] leading-tight font-medium">
              <bdi lang="en">{stat.name}</bdi>
            </span>
            <Flags stat={stat} />
          </div>
          <p className="mt-0.5 text-[12px] text-muted">{stat.type[locale]}</p>
          {alsoIn.length > 0 && (
            <p className="mt-0.5 text-[11px] text-muted">{t("analysis.alsoIn", { categories: catNames(alsoIn) })}</p>
          )}
        </div>
      </div>

      <div className="mt-3">
        <UnitsBar units={stat.units} max={max} />
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
        <div>
          <dt className="caps text-muted">{t("analysis.col.orders")}</dt>
          <dd className="mt-0.5">
            <Num value={stat.orders} />
          </dd>
        </div>
        <div>
          <dt className="caps text-muted">{t("analysis.col.revenue")}</dt>
          <dd className="mt-0.5">
            <Price fils={stat.revenueFils} />
          </dd>
        </div>
        <div>
          <dt className="caps text-muted">{t("analysis.col.stock")}</dt>
          <dd className="mt-0.5">
            <Num value={stat.stock} />
          </dd>
        </div>
      </dl>

      {canExpand && (
        <div className="mt-3 border-t border-line pt-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="caps inline-flex items-center gap-1 text-[12px] text-muted underline-offset-4 hover:text-ink"
          >
            {t(open ? "analysis.hideSizes" : "analysis.showSizes")}
            <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
          </button>
          {open && (
            <div className="mt-2">
              <SizeRows sizes={stat.sizes} />
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function CategorySectionView({
  section,
  catNames,
  onExport,
  exporting,
}: {
  section: Section;
  catNames: (slugs: string[]) => string;
  onExport: () => void;
  exporting: boolean;
}) {
  const t = useTranslations("admin");
  const locale = useLocale() as Locale;
  const max = Math.max(1, ...section.products.map((p) => p.units));

  return (
    <section data-testid="analysis-section" data-slug={section.slug} data-units={section.units} className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="caps font-serif text-[22px] font-medium">{section.name[locale]}</h2>
          <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
            <span>
              <Num value={section.units} /> {t("analysis.unitsLabel")}
            </span>
            <span aria-hidden>·</span>
            <span>{t("analysis.ordersCount", { count: section.orders })}</span>
            <span aria-hidden>·</span>
            <Price fils={section.revenueFils} />
          </p>
        </div>
        <button
          type="button"
          onClick={onExport}
          disabled={exporting || section.products.length === 0}
          data-testid={`analysis-export-${section.slug}`}
          aria-label={t("analysis.exportName", { name: section.name[locale] })}
          className="caps inline-flex min-h-9 items-center gap-1.5 border border-line bg-paper px-3 text-[12px] text-ink transition-colors hover:border-ink disabled:pointer-events-none disabled:opacity-45"
        >
          <FileDown className="size-3.5" strokeWidth={1.5} aria-hidden />
          {t("analysis.exportBtn")}
        </button>
      </div>

      {section.products.length === 0 ? (
        <p className="mt-4 border border-line bg-paper px-4 py-10 text-center text-[14px] text-muted">
          {t("analysis.sectionEmpty")}
        </p>
      ) : (
        <>
          <div className="mt-4 hidden overflow-x-auto border border-line md:block">
            <table className="w-full min-w-[760px] border-collapse text-[14px]">
              <thead className="border-b border-line bg-tile">
                <tr>
                  <th scope="col" className="caps px-3 py-2.5 text-start text-[12px] font-medium text-muted">
                    {t("analysis.col.product")}
                  </th>
                  <th scope="col" className="caps px-3 py-2.5 text-start text-[12px] font-medium text-muted">
                    {t("analysis.col.type")}
                  </th>
                  <th scope="col" className="caps px-3 py-2.5 text-start text-[12px] font-medium text-muted">
                    {t("analysis.col.price")}
                  </th>
                  <th scope="col" className="caps px-3 py-2.5 text-start text-[12px] font-medium text-muted">
                    {t("analysis.col.stock")}
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
                  <th scope="col" className="px-3 py-2.5">
                    <span className="sr-only">{t("analysis.col.size")}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {section.products.map((stat) => (
                  <ProductRow key={stat.slug} stat={stat} sectionSlug={section.slug} max={max} catNames={catNames} />
                ))}
              </tbody>
            </table>
          </div>

          <ul className="mt-4 space-y-3 md:hidden">
            {section.products.map((stat) => (
              <ProductCard key={stat.slug} stat={stat} sectionSlug={section.slug} max={max} catNames={catNames} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
