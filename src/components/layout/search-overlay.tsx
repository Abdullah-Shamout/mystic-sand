"use client";

import { Plus, Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Dialog } from "radix-ui";
import { useDeferredValue, useState } from "react";
import { Price } from "@/components/ui/price";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import type { Product } from "@/data/types";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { useLiveCatalog } from "@/lib/live";
import { searchProducts } from "@/lib/search";
import { useAddToBag } from "@/lib/use-add-to-bag";
import { useUi } from "@/store/ui";

const TRENDING = ["i", "ii", "iii", "aura", "oud"];
const TOP = ["cafe", "oud-chips", "dune"];

function ResultRow({ product, onNavigate }: { product: Product; onNavigate: () => void }) {
  const t = useTranslations("common");
  const locale = useLocale() as Locale;
  const addToBag = useAddToBag();
  const variant = product.variants[0];
  const multi = product.variants.length > 1;
  return (
    <li className="flex items-center gap-4 border-b border-line py-3">
      <Link href={`/product/${product.slug}`} onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-4">
        <span className="relative size-16 shrink-0 bg-tile">
          <ResponsiveImage image={product.images.card} alt="" sizes="64px" />
        </span>
        <span className="min-w-0">
          <span className="caps block truncate font-serif text-[18px] font-medium">
            <bdi lang="en">{product.name}</bdi>
          </span>
          <span className="block truncate text-[13px] text-muted">
            {product.type[locale]} · <bdi className="whitespace-nowrap">{variant.size[locale]}</bdi>
          </span>
        </span>
      </Link>
      <span className="text-[14px]">
        {multi ? t("product.from", { price: "" }).trim() : null} <Price fils={variant.priceFils} />
      </span>
      {multi ? (
        <Link
          href={`/product/${product.slug}`}
          onClick={onNavigate}
          className="caps inline-flex h-10 items-center border border-ink px-3 text-[12px] hover:bg-ink hover:text-paper"
        >
          {t("product.chooseSize")}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => addToBag(product, variant)}
          className="inline-flex size-10 items-center justify-center border border-ink transition-colors hover:bg-ink hover:text-paper"
          aria-label={t("product.quickAdd", { name: product.name })}
        >
          <Plus className="size-4" strokeWidth={1.5} />
        </button>
      )}
    </li>
  );
}

/** Amouage-style search panel: underline input, Trending + Top products, live results. */
export function SearchOverlay() {
  const t = useTranslations("common");
  const locale = useLocale() as Locale;
  const open = useUi((s) => s.searchOpen);
  const setOpen = useUi((s) => s.setSearchOpen);
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const catalog = useLiveCatalog();
  const results = searchProducts(deferred, catalog.visible, locale);
  const close = () => setOpen(false);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setQuery("");
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 top-0 z-50 max-h-dvh overflow-y-auto bg-ivory text-ink outline-none data-[state=closed]:animate-fade-out data-[state=open]:animate-drop-in"
        >
          <div className="mx-auto max-w-[1100px] px-6 pt-6 pb-12 md:pt-10">
            <div className="flex items-center justify-between">
              <Dialog.Title className="caps text-[13px] text-muted">{t("search.label")}</Dialog.Title>
              <Dialog.Close className="-me-2 inline-flex size-11 items-center justify-center" aria-label={t("close")}>
                <X className="size-5" strokeWidth={1.25} />
              </Dialog.Close>
            </div>
            <form
              role="search"
              onSubmit={(e) => e.preventDefault()}
              className="mt-2 flex items-center gap-3 border-b border-[#c1c1c1] focus-within:border-ink"
            >
              <Search className="size-5 shrink-0" strokeWidth={1.25} aria-hidden />
              <input
                autoFocus
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("search.placeholder")}
                aria-label={t("search.label")}
                className="h-14 w-full bg-transparent text-[18px] outline-none placeholder:text-muted/70"
                enterKeyHint="search"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="text-[13px] text-muted underline">
                  {t("search.clear")}
                </button>
              )}
            </form>

            {deferred.trim() ? (
              <div className="mt-6">
                <p className="text-[13px] text-muted" role="status">
                  {t("search.results", { count: results.length })}
                </p>
                {results.length === 0 ? (
                  <p className="mt-6 text-[15px]">{t("search.noResults", { query: deferred })}</p>
                ) : (
                  <ul className="mt-2">
                    {results.map((p) => (
                      <ResultRow key={p.slug} product={p} onNavigate={close} />
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="mt-10 grid gap-10 md:grid-cols-[1fr_2fr] md:divide-x md:divide-[#b6b6b6] rtl:md:divide-x-reverse">
                <div>
                  <h3 className="caps text-[13px] text-muted">{t("search.trending")}</h3>
                  <ul className="mt-4 space-y-2">
                    {TRENDING.map((slug) => {
                      const p = catalog.bySlug.get(slug);
                      return p && !p.hidden ? (
                        <li key={slug}>
                          <Link href={`/product/${slug}`} onClick={close} className="text-[16px] hover:underline">
                            <bdi lang="en">{p.name}</bdi>
                            <span className="text-muted"> — {p.type[locale]}</span>
                          </Link>
                        </li>
                      ) : null;
                    })}
                  </ul>
                </div>
                <div className="md:ps-10">
                  <h3 className="caps text-[13px] text-muted">{t("search.topProducts")}</h3>
                  <ul className="mt-4 grid grid-cols-3 gap-3">
                    {TOP.map((slug) => {
                      const p = catalog.bySlug.get(slug);
                      return p && !p.hidden ? (
                        <li key={slug}>
                          <Link href={`/product/${slug}`} onClick={close} className="group block">
                            <span className="relative block aspect-square bg-tile">
                              <ResponsiveImage image={p.images.card} alt="" sizes="(min-width: 768px) 200px, 30vw" />
                            </span>
                            <span className="caps mt-2 block truncate font-serif text-[16px] font-medium">
                              <bdi lang="en">{p.name}</bdi>
                            </span>
                            <span className="block text-[13px] text-muted">
                              <bdi>{p.variants[0].size[locale]}</bdi>
                            </span>
                          </Link>
                        </li>
                      ) : null;
                    })}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
