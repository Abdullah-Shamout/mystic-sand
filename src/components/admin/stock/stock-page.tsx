"use client";

import { FileDown, Minus, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { SelectInput, TextInput } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import type { CategorySlug, Product, Variant } from "@/data/types";
import type { Locale } from "@/i18n/routing";
import { isCustomSlug } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import { toLatinDigits } from "@/lib/digits";
import { useMounted, useNow } from "@/lib/hooks";
import { useLiveCatalog } from "@/lib/live";
import { normalizeSearch } from "@/lib/search";
import { availableFromStock, LOW_STOCK } from "@/lib/stock";
import { useCatalogStore } from "@/store/catalog";
import { useStockStore, type SoldMap } from "@/store/stock";
import { useUi } from "@/store/ui";
import { KpiTile } from "../kpi-tile";

type StatusFilter = "all" | "low" | "out";
type CatFilter = "all" | CategorySlug;

/** A non-negative integer from an admin-typed value (Arabic digits accepted), or null. */
function parseStockValue(input: string): number | null {
  const s = toLatinDigits(input ?? "").trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

const statusOf = (available: number): StatusFilter | "in" =>
  available <= 0 ? "out" : available <= LOW_STOCK ? "low" : "in";

function matchesProduct(product: Product, query: string, locale: Locale): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  const haystack = [product.name, product.type.en, product.type.ar, product.type[locale], ...product.aliases, ...product.variants.map((v) => v.sku)]
    .map(normalizeSearch)
    .join(" ");
  return haystack.includes(q);
}

function inCollection(product: Product, cat: CatFilter): boolean {
  if (cat === "all") return true;
  return product.category === cat || (product.alsoIn?.includes(cat) ?? false);
}

/** An LTR-isolated integer, so counts never reorder inside Arabic text. */
function Num({ value, className }: { value: number; className?: string }) {
  return (
    <bdi dir="ltr" className={cn("figures", className)}>
      {value}
    </bdi>
  );
}

export function StockPage() {
  const t = useTranslations("admin");
  const locale = useLocale() as Locale;
  const mounted = useMounted();
  const now = useNow();
  const pushToast = useUi((s) => s.pushToast);

  const catalog = useLiveCatalog();
  const sold = useStockStore((s) => s.sold);
  const setVariantStock = useCatalogStore((s) => s.setVariantStock);
  const resetSold = useStockStore((s) => s.resetSold);

  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<CatFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [exporting, setExporting] = useState(false);

  const catName = (slug: CategorySlug): string =>
    catalog.categories.find((c) => c.slug === slug)?.name[locale] ?? slug;

  /** Set a SKU's stock to an exact value and clear its "sold since set" counter. */
  const applyStock = (sku: string, value: number, name: string) => {
    setVariantStock(sku, Math.max(0, value));
    resetSold(sku);
    pushToast({ title: t("stock.saved", { name }) });
  };

  // Summary over the whole catalog (hidden and custom included) — a steady overview.
  const summary = useMemo(() => {
    let productsInStock = 0;
    let sizesOut = 0;
    let sizesLow = 0;
    let unitsAvailable = 0;
    for (const p of catalog.products) {
      let anyInStock = false;
      for (const v of p.variants) {
        const available = availableFromStock(v.stock, sold[v.sku] ?? 0);
        unitsAvailable += available;
        if (available <= 0) sizesOut += 1;
        else {
          anyInStock = true;
          if (available <= LOW_STOCK) sizesLow += 1;
        }
      }
      if (anyInStock) productsInStock += 1;
    }
    return { productsInStock, sizesOut, sizesLow, unitsAvailable };
  }, [catalog.products, sold]);

  // Products that pass search + collection, each with the variant rows that pass the status filter.
  const groups = useMemo(() => {
    return catalog.products
      .filter((p) => matchesProduct(p, query, locale) && inCollection(p, cat))
      .map((p) => {
        const rows = p.variants
          .map((v) => ({ variant: v, available: availableFromStock(v.stock, sold[v.sku] ?? 0) }))
          .filter((r) => {
            if (status === "all") return true;
            if (status === "out") return r.available <= 0;
            return r.available > 0 && r.available <= LOW_STOCK;
          });
        return { product: p, rows };
      })
      .filter((g) => g.rows.length > 0);
  }, [catalog.products, query, cat, status, locale, sold]);

  const onExport = async () => {
    if (!now) return;
    setExporting(true);
    try {
      const statusLabel = (available: number) => t(`stock.status.${statusOf(available)}`);
      const rows = catalog.products.flatMap((p) =>
        p.variants.map((v) => {
          const available = availableFromStock(v.stock, sold[v.sku] ?? 0);
          return {
            product: p.name,
            collection: [p.category, ...(p.alsoIn ?? []).filter((c) => c !== p.category)].map(catName).join(", "),
            size: v.size[locale],
            sku: v.sku,
            set: v.stock,
            sold: sold[v.sku] ?? 0,
            available,
            status: statusLabel(available),
            hidden: Boolean(p.hidden),
            custom: isCustomSlug(p.slug),
          };
        }),
      );
      const { exportStock } = await import("@/lib/admin/excel-writer");
      await exportStock({ rows, locale, now });
    } catch {
      pushToast({ title: t("stock.exportError") });
    } finally {
      setExporting(false);
    }
  };

  if (!mounted) return <StockSkeleton />;

  const STATUSES: StatusFilter[] = ["all", "low", "out"];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="caps font-serif text-title font-medium">{t("stock.title")}</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">{t("stock.intro")}</p>
        </div>
        <button
          type="button"
          onClick={onExport}
          disabled={exporting}
          data-testid="stock-export"
          className="caps inline-flex min-h-10 items-center gap-1.5 border border-line bg-paper px-3 text-[12px] text-ink transition-colors hover:border-ink disabled:pointer-events-none disabled:opacity-45"
        >
          <FileDown className="size-3.5" strokeWidth={1.5} aria-hidden />
          {exporting ? t("stock.exporting") : t("stock.export")}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile testId="kpi-stock-products" label={t("stock.summary.products")} value={<Num value={summary.productsInStock} />} />
        <KpiTile testId="kpi-stock-out" label={t("stock.summary.out")} value={<Num value={summary.sizesOut} />} />
        <KpiTile testId="kpi-stock-low" label={t("stock.summary.low")} value={<Num value={summary.sizesLow} />} />
        <KpiTile testId="kpi-stock-units" label={t("stock.summary.units")} value={<Num value={summary.unitsAvailable} />} />
      </div>

      <div className="grid gap-3 border border-line bg-paper p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
        <div>
          <label htmlFor="stock-search" className="caps mb-1.5 block text-[12px] text-muted">
            {t("stock.searchLabel")}
          </label>
          <TextInput
            id="stock-search"
            type="search"
            value={query}
            placeholder={t("stock.searchPlaceholder")}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="stock-search"
          />
        </div>
        <div>
          <label htmlFor="stock-collection" className="caps mb-1.5 block text-[12px] text-muted">
            {t("stock.collectionLabel")}
          </label>
          <SelectInput
            id="stock-collection"
            value={cat}
            onChange={(e) => setCat(e.target.value as CatFilter)}
            className="lg:w-44"
            data-testid="stock-collection"
          >
            <option value="all">{t("stock.collectionAll")}</option>
            {catalog.categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name[locale]}
              </option>
            ))}
          </SelectInput>
        </div>
        <div role="group" aria-label={t("stock.filterLabel")} className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              aria-pressed={status === s}
              data-testid={`stock-filter-${s}`}
              className={cn(
                "caps inline-flex min-h-11 items-center border px-3 text-[13px] transition-colors",
                status === s ? "border-racing bg-racing text-cream" : "border-line bg-paper text-ink hover:border-ink",
              )}
            >
              {t(`stock.filter.${s}`)}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="border border-line bg-paper px-4 py-16 text-center text-[15px] text-muted" data-testid="stock-empty">
          {t("stock.empty")}
        </p>
      ) : (
        <ul className="space-y-4">
          {groups.map(({ product, rows }) => (
            <ProductBlock
              key={product.slug}
              product={product}
              rows={rows}
              sold={sold}
              onApply={applyStock}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductBlock({
  product,
  rows,
  sold,
  onApply,
}: {
  product: Product;
  rows: Array<{ variant: Variant; available: number }>;
  sold: SoldMap;
  onApply: (sku: string, value: number, name: string) => void;
}) {
  const t = useTranslations("admin");
  const locale = useLocale() as Locale;
  const custom = isCustomSlug(product.slug);

  return (
    <li data-testid="stock-product" data-slug={product.slug} className="border border-line bg-paper p-4">
      <div className="flex items-start gap-3">
        <div className="relative size-14 shrink-0 overflow-hidden border border-line bg-tile">
          <ResponsiveImage image={product.images.card} alt="" sizes="56px" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="caps font-serif text-[20px] leading-tight font-medium">
              <bdi lang="en">{product.name}</bdi>
            </h2>
            {product.hidden && (
              <span className="caps inline-flex items-center border border-line bg-tile px-1.5 py-0.5 text-[11px] text-muted">
                {t("stock.hiddenBadge")}
              </span>
            )}
            {custom && (
              <span className="caps inline-flex items-center border border-racing/30 bg-racing/10 px-1.5 py-0.5 text-[11px] text-racing">
                {t("stock.customBadge")}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[13px] text-muted">{product.type[locale]}</p>
        </div>
      </div>

      <ul className="mt-4 divide-y divide-line border-t border-line">
        {rows.map(({ variant }) => (
          <StockRow
            key={variant.sku}
            name={product.name}
            variant={variant}
            sold={sold[variant.sku] ?? 0}
            onApply={onApply}
          />
        ))}
      </ul>
    </li>
  );
}

function StockRow({
  name,
  variant,
  sold,
  onApply,
}: {
  name: string;
  variant: Variant;
  sold: number;
  onApply: (sku: string, value: number, name: string) => void;
}) {
  const t = useTranslations("admin");
  const locale = useLocale() as Locale;
  const available = availableFromStock(variant.stock, sold);
  const state = statusOf(available);
  const inputRef = useRef<HTMLInputElement>(null);

  const save = () => {
    const parsed = parseStockValue(inputRef.current?.value ?? "");
    if (parsed === null) return;
    onApply(variant.sku, parsed, name);
  };

  return (
    <li
      data-testid="stock-row"
      data-sku={variant.sku}
      data-available={available}
      data-set={variant.stock}
      data-sold={sold}
      className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4"
    >
      <div className="min-w-[8rem] flex-1">
        <p className="text-[15px] font-medium">
          <bdi className="figures">{variant.size[locale]}</bdi>
        </p>
        <p className="mt-0.5 text-[12px] text-muted">
          <bdi dir="ltr" className="figures">
            {variant.sku}
          </bdi>
        </p>
      </div>

      <dl className="flex items-center gap-x-6 text-[13px]">
        <div>
          <dt className="caps text-[11px] text-muted">{t("stock.col.set")}</dt>
          <dd className="mt-0.5">
            <Num value={variant.stock} />
          </dd>
        </div>
        <div>
          <dt className="caps text-[11px] text-muted">{t("stock.col.sold")}</dt>
          <dd className="mt-0.5">
            <Num value={sold} />
          </dd>
        </div>
      </dl>

      <div className="min-w-[7.5rem]">
        <p className="caps text-[11px] text-muted">{t("stock.col.available")}</p>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="figures text-[22px] leading-none font-medium" data-testid="stock-available-value">
            <Num value={available} />
          </span>
          {state === "out" && (
            <span className="caps inline-flex items-center border border-danger/40 bg-danger/10 px-1.5 py-0.5 text-[10px] text-danger">
              {t("stock.outChip")}
            </span>
          )}
          {state === "low" && (
            <span className="caps inline-flex items-center border border-sand-deep/50 bg-sand/30 px-1.5 py-0.5 text-[10px] text-ink">
              {t("stock.lowChip")}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onApply(variant.sku, Math.max(0, available - 1), name)}
          disabled={available <= 0}
          aria-label={t("stock.decrease", { size: variant.size[locale] })}
          data-testid="stock-dec"
          className="inline-flex size-10 items-center justify-center border border-line bg-paper transition-colors hover:border-ink disabled:opacity-35"
        >
          <Minus className="size-4" strokeWidth={1.5} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onApply(variant.sku, available + 1, name)}
          aria-label={t("stock.increase", { size: variant.size[locale] })}
          data-testid="stock-inc"
          className="inline-flex size-10 items-center justify-center border border-line bg-paper transition-colors hover:border-ink"
        >
          <Plus className="size-4" strokeWidth={1.5} aria-hidden />
        </button>
        <TextInput
          key={available}
          ref={inputRef}
          dir="ltr"
          inputMode="numeric"
          defaultValue={String(available)}
          aria-label={t("stock.setExact", { size: variant.size[locale] })}
          className="h-10 w-16 text-center"
          data-testid="stock-input"
        />
        <button
          type="button"
          onClick={save}
          data-testid="stock-save"
          className="caps inline-flex min-h-10 items-center border border-ink bg-transparent px-3 text-[12px] transition-colors hover:bg-ink hover:text-paper"
        >
          {t("stock.save")}
        </button>
      </div>
    </li>
  );
}

function StockSkeleton() {
  return (
    <div className="space-y-8" aria-busy>
      <Skeleton className="h-9 w-40" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
