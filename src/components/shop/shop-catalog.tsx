"use client";

import { ChevronDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { ProductGrid } from "@/components/product/product-grid";
import { categories } from "@/data/categories";
import type { Product } from "@/data/types";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import { useLiveCatalog } from "@/lib/live";
import { useUi } from "@/store/ui";

type Sort = "featured" | "price-asc" | "price-desc";

const SORT_LABEL = { featured: "featured", "price-asc": "priceAsc", "price-desc": "priceDesc" } as const;
const isSort = (value: string): value is Sort => value in SORT_LABEL;

// The chosen order survives chip navigation (same tab, client-side) but every full
// page load — and the static HTML — starts at "featured", so hydration always matches.
let currentSort: Sort = "featured";
const sortListeners = new Set<() => void>();
const sortStore = {
  subscribe(listener: () => void) {
    sortListeners.add(listener);
    return () => {
      sortListeners.delete(listener);
    };
  },
  get: (): Sort => currentSort,
  getServer: (): Sort => "featured",
  set(next: Sort) {
    currentSort = next;
    sortListeners.forEach((listener) => listener());
  },
};

const useSort = () => useSyncExternalStore(sortStore.subscribe, sortStore.get, sortStore.getServer);

const minPrice = (p: Product) => Math.min(...p.variants.map((v) => v.priceFils));

/**
 * Collection chips (links, so every collection is a real page), the product count and
 * the sort. Lives in the shop layout, so it stays mounted from one collection to the
 * next: the page keeps its scroll position and the chip keeps focus.
 */
export function ShopToolbar({ active, count }: { active: string; count: number }) {
  const t = useTranslations("shop");
  const locale = useLocale() as Locale;
  const announce = useUi((s) => s.announce);
  const sort = useSort();
  const sortId = useId();
  const chipsRef = useRef<HTMLUListElement>(null);

  const chips = [
    { slug: "all", href: "/shop", label: t("filters.all") },
    ...categories.map((c) => ({ slug: c.slug, href: `/shop/${c.slug}`, label: c.name[locale] })),
  ];

  // Phones: bring the active chip into view inside the scrolling row (never the page).
  // Runs again once web fonts are in (Arabic faces load late and widen the chips),
  // unless the shopper has scrolled the row in the meantime.
  useEffect(() => {
    const row = chipsRef.current;
    if (!row) return;
    let settled: number | null = null;
    const reveal = () => {
      const chip = row.querySelector<HTMLElement>('[aria-current="page"]');
      if (!chip || row.scrollWidth <= row.clientWidth) return;
      const r = row.getBoundingClientRect();
      const c = chip.getBoundingClientRect();
      if (c.left < r.left || c.right > r.right) {
        row.scrollBy({ left: c.left + c.width / 2 - (r.left + r.width / 2), behavior: "instant" });
      }
      settled = row.scrollLeft;
    };
    reveal();
    let live = true;
    document.fonts?.ready.then(() => {
      if (live && (settled === null || row.scrollLeft === settled)) reveal();
    });
    return () => {
      live = false;
    };
  }, [active]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-y-1 py-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:py-5">
      <nav aria-label={t("filters.label")} className="col-span-2 lg:col-span-1 lg:col-start-2 lg:row-start-1">
        <ul
          ref={chipsRef}
          className={cn(
            "no-scrollbar flex gap-2 overflow-x-auto overscroll-x-contain py-1 md:justify-center-safe",
            // Edge spacers are flex items: inline-end padding is left out of the scroll area in RTL.
            "before:w-2 before:shrink-0 before:content-[''] after:w-2 after:shrink-0 after:content-['']",
            "[mask-image:linear-gradient(90deg,transparent,#000_16px,#000_calc(100%-16px),transparent)] md:[mask-image:none]",
          )}
        >
          {chips.map((chip) => {
            const current = chip.slug === active;
            return (
              <li key={chip.slug} className="shrink-0">
                <Link
                  href={chip.href}
                  scroll={false}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "caps inline-flex h-11 items-center border px-4 text-[13px] whitespace-nowrap transition-colors duration-150",
                    current ? "border-ink bg-ink text-paper" : "border-ink/20 text-ink hover:border-ink",
                  )}
                >
                  {chip.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <p className="ps-4 text-[14px] text-muted md:ps-6 lg:col-start-1 lg:row-start-1">
        {t("count", { count, n: String(count) })}
      </p>

      <div className="flex items-center gap-2 justify-self-end pe-4 md:pe-6 lg:col-start-3 lg:row-start-1">
        <label htmlFor={sortId} className="text-[14px] whitespace-nowrap text-muted">
          {t("sort.label")}
        </label>
        <div className="relative">
          <select
            id={sortId}
            value={sort}
            onChange={(e) => {
              const next = e.target.value;
              if (!isSort(next)) return;
              sortStore.set(next);
              announce(t("sort.announce", { order: t(`sort.${SORT_LABEL[next]}`) }));
            }}
            className="h-11 cursor-pointer appearance-none border-0 border-b border-ink/25 bg-transparent ps-1 pe-7 text-ink transition-colors hover:border-ink"
          >
            {(Object.keys(SORT_LABEL) as Sort[]).map((value) => (
              <option key={value} value={value}>
                {t(`sort.${SORT_LABEL[value]}`)}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden
            strokeWidth={1.25}
            className="pointer-events-none absolute end-0 top-1/2 size-4 -translate-y-1/2"
          />
        </div>
      </div>
    </div>
  );
}

/** The edge-to-edge grid of one collection, in the order chosen in the toolbar. */
export function ShopGrid({ slugs }: { slugs: string[] }) {
  const t = useTranslations("shop");
  const sort = useSort();
  const catalog = useLiveCatalog();
  const list = slugs
    .map((slug) => catalog.bySlug.get(slug))
    .filter((p): p is Product => p !== undefined && !p.hidden);
  const sorted =
    sort === "featured"
      ? list
      : [...list].sort((a, b) => (minPrice(a) - minPrice(b)) * (sort === "price-asc" ? 1 : -1));

  return (
    <>
      <h2 className="sr-only">{t("productsHeading")}</h2>
      <ProductGrid products={sorted} priorityCount={4} />
    </>
  );
}
