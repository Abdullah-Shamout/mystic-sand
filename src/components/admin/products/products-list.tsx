"use client";

import { ExternalLink, Eye, EyeOff, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Price } from "@/components/ui/price";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { SelectInput, TextInput } from "@/components/ui/form";
import { categories as baseCategories } from "@/data/categories";
import type { CategorySlug, Localized, Product } from "@/data/types";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { CATEGORY_SLUGS, isCustomSlug, productHref, type Catalog } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import { getLiveCatalog, useLiveCatalog } from "@/lib/live";
import { deleteUpload, isUploadKey, uploadIdFromKey } from "@/lib/uploads";
import { normalizeSearch } from "@/lib/search";
import { useCatalogStore } from "@/store/catalog";
import { useUi } from "@/store/ui";
import { ConfirmDialog } from "../confirm-dialog";

type CatFilter = "all" | CategorySlug;

function matches(product: Product, query: string, locale: Locale): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  const haystack = [
    product.name,
    product.type.en,
    product.type.ar,
    product.type[locale],
    ...product.aliases,
    ...product.variants.map((v) => v.sku),
  ]
    .map(normalizeSearch)
    .join(" ");
  return haystack.includes(q);
}

/** Every upload key referenced by any product in the catalog, so an unused one can be pruned. */
function referencedUploads(catalog: Catalog): Set<string> {
  const keys = new Set<string>();
  for (const p of catalog.products) {
    for (const key of [p.images.card, p.images.hover, ...p.images.gallery]) {
      if (key && isUploadKey(key)) keys.add(key);
    }
  }
  return keys;
}

export function ProductsList() {
  const t = useTranslations("admin");
  const locale = useLocale() as Locale;
  const catalog = useLiveCatalog();
  const pushToast = useUi((s) => s.pushToast);

  const setCategory = useCatalogStore((s) => s.setCategory);
  const setHidden = useCatalogStore((s) => s.setHidden);
  const resetProduct = useCatalogStore((s) => s.resetProduct);
  const deleteProduct = useCatalogStore((s) => s.deleteProduct);

  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<CatFilter>("all");
  const [showHidden, setShowHidden] = useState(true);
  const [confirm, setConfirm] = useState<
    | { kind: "reset" | "delete"; slug: string; name: string }
    | null
  >(null);

  const catName = (slug: CategorySlug): string =>
    catalog.categories.find((c) => c.slug === slug)?.name[locale] ?? slug;

  const list = useMemo(() => {
    return catalog.products.filter((p) => {
      if (!showHidden && p.hidden) return false;
      if (cat !== "all" && p.category !== cat && !(p.alsoIn?.includes(cat) ?? false)) return false;
      return matches(p, query, locale);
    });
  }, [catalog.products, showHidden, cat, query, locale]);

  const onMove = (product: Product, next: CategorySlug) => {
    if (next === product.category) return;
    const prevCategory = product.category;
    const prevAlsoIn = product.alsoIn ? [...product.alsoIn] : [];
    setCategory(product.slug, next);
    pushToast({
      title: t("products.toast.moved", { name: product.name, category: catName(next) }),
      actions: [
        {
          label: t("products.undo"),
          onClick: () => setCategory(product.slug, prevCategory, prevAlsoIn),
        },
      ],
    });
  };

  const onToggleHidden = (product: Product) => {
    const next = !product.hidden;
    setHidden(product.slug, next);
    pushToast({
      title: next
        ? t("products.toast.hidden", { name: product.name })
        : t("products.toast.shown", { name: product.name }),
      actions: [{ label: t("products.undo"), onClick: () => setHidden(product.slug, !next) }],
    });
  };

  const doReset = (slug: string, name: string) => {
    resetProduct(slug);
    pushToast({ title: t("products.toast.reset", { name }) });
  };

  const doDelete = (product: Product) => {
    const uploads = [product.images.card, product.images.hover, ...product.images.gallery].filter(
      (k): k is string => typeof k === "string" && isUploadKey(k),
    );
    deleteProduct(product.slug);
    // Drop uploads this product used that no other product references any more (read the
    // catalog rebuilt from the store's state *after* the delete).
    const stillUsed = referencedUploads(getLiveCatalog());
    for (const key of new Set(uploads)) {
      if (!stillUsed.has(key)) deleteUpload(uploadIdFromKey(key));
    }
    pushToast({ title: t("products.toast.deleted", { name: product.name }) });
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h1 className="caps font-serif text-title font-medium">{t("products.title")}</h1>
          <span className="text-[14px] text-muted" data-testid="products-count">
            {t("products.count", { count: list.length })}
          </span>
        </div>
        <Link
          href="/admin/products/edit?p=new"
          data-testid="products-add"
          className="caps inline-flex min-h-11 items-center gap-2 border border-racing bg-racing px-4 text-[13px] text-cream transition-colors hover:bg-racing-deep"
        >
          <Plus className="size-4" strokeWidth={1.5} aria-hidden />
          {t("products.add")}
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
        <div>
          <label htmlFor="products-search" className="caps mb-1.5 block text-[12px] text-muted">
            {t("products.searchLabel")}
          </label>
          <TextInput
            id="products-search"
            type="search"
            value={query}
            placeholder={t("products.searchPlaceholder")}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="products-search"
          />
        </div>
        <div>
          <label htmlFor="products-filter" className="caps mb-1.5 block text-[12px] text-muted">
            {t("products.filterLabel")}
          </label>
          <SelectInput
            id="products-filter"
            value={cat}
            onChange={(e) => setCat(e.target.value as CatFilter)}
            className="sm:w-48"
          >
            <option value="all">{t("products.filterAll")}</option>
            {catalog.categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name[locale]}
              </option>
            ))}
          </SelectInput>
        </div>
        <label className="caps mb-1 flex min-h-11 cursor-pointer items-center gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
            className="size-[18px] accent-racing"
            data-testid="products-show-hidden"
          />
          {t("products.showHidden")}
        </label>
      </div>

      {list.length === 0 ? (
        <p className="border border-line bg-paper px-4 py-16 text-center text-[15px] text-muted">
          {t("products.empty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {list.map((product) => (
            <Row
              key={product.slug}
              product={product}
              edited={catalog.edited.has(product.slug)}
              catName={catName}
              onMove={onMove}
              onToggleHidden={onToggleHidden}
              onReset={(slug, name) => setConfirm({ kind: "reset", slug, name })}
              onDelete={(slug, name) => setConfirm({ kind: "delete", slug, name })}
            />
          ))}
        </ul>
      )}

      <CollectionsPanel />

      <ConfirmDialog
        open={confirm?.kind === "reset"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t("products.confirm.resetTitle")}
        message={confirm ? t("products.confirm.resetMessage", { name: confirm.name }) : ""}
        confirmLabel={t("products.confirm.resetConfirm")}
        onConfirm={() => confirm && doReset(confirm.slug, confirm.name)}
      />
      <ConfirmDialog
        open={confirm?.kind === "delete"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t("products.confirm.deleteTitle")}
        message={confirm ? t("products.confirm.deleteMessage", { name: confirm.name }) : ""}
        confirmLabel={t("products.confirm.deleteConfirm")}
        danger
        onConfirm={() => {
          if (!confirm) return;
          const product = catalog.bySlug.get(confirm.slug);
          if (product) doDelete(product);
        }}
      />
    </div>
  );
}

type BadgeTone = "visible" | "hidden" | "edited" | "custom" | "new";

function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  const styles: Record<BadgeTone, string> = {
    visible: "border-success/30 bg-success/10 text-success",
    hidden: "border-line bg-tile text-muted",
    edited: "border-sand-deep/40 bg-sand/25 text-ink",
    custom: "border-racing/30 bg-racing/10 text-racing",
    new: "border-ink/60 text-ink",
  };
  return (
    <span className={cn("caps inline-flex items-center border px-2 py-0.5 text-[11px] whitespace-nowrap", styles[tone])}>
      {children}
    </span>
  );
}

function Action({
  onClick,
  href,
  target,
  label,
  ariaLabel,
  icon: Icon,
  tone = "default",
}: {
  onClick?: () => void;
  href?: string;
  target?: string;
  label: string;
  ariaLabel?: string;
  icon: typeof Pencil;
  tone?: "default" | "danger";
}) {
  const cls = cn(
    "caps inline-flex min-h-9 items-center gap-1.5 text-[12px] underline-offset-4 transition-colors hover:underline",
    tone === "danger" ? "text-danger" : "text-ink hover:text-racing",
  );
  const inner = (
    <>
      <Icon className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
      {label}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        target={target}
        rel={target === "_blank" ? "noopener noreferrer" : undefined}
        aria-label={ariaLabel}
        className={cls}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls} aria-label={ariaLabel ?? label}>
      {inner}
    </button>
  );
}

function Row({
  product,
  edited,
  catName,
  onMove,
  onToggleHidden,
  onReset,
  onDelete,
}: {
  product: Product;
  edited: boolean;
  catName: (slug: CategorySlug) => string;
  onMove: (product: Product, next: CategorySlug) => void;
  onToggleHidden: (product: Product) => void;
  onReset: (slug: string, name: string) => void;
  onDelete: (slug: string, name: string) => void;
}) {
  const t = useTranslations("admin");
  const locale = useLocale() as Locale;
  const custom = isCustomSlug(product.slug);
  const prices = product.variants.map((v) => v.priceFils);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const totalStock = product.variants.reduce((n, v) => n + v.stock, 0);
  const alsoIn = (product.alsoIn ?? []).filter((c) => c !== product.category);

  return (
    <li
      data-testid="product-row"
      data-slug={product.slug}
      className="flex flex-col gap-4 border border-line bg-paper p-4 sm:flex-row sm:items-start"
    >
      <div className="relative size-20 shrink-0 overflow-hidden border border-line bg-tile">
        <ResponsiveImage image={product.images.card} alt="" sizes="80px" />
      </div>

      <div className="min-w-0 flex-1 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="caps font-serif text-[20px] leading-tight font-medium">
            <bdi lang="en">{product.name}</bdi>
          </h2>
          {product.hidden ? <Badge tone="hidden">{t("products.badge.hidden")}</Badge> : <Badge tone="visible">{t("products.badge.visible")}</Badge>}
          {edited && <Badge tone="edited">{t("products.badge.edited")}</Badge>}
          {custom && <Badge tone="custom">{t("products.badge.custom")}</Badge>}
          {product.badge === "new" && <Badge tone="new">{t("products.badge.new")}</Badge>}
        </div>

        <p className="text-[13px] text-muted">{product.type[locale]}</p>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <label htmlFor={`cat-${product.slug}`} className="caps text-[11px] text-muted">
              {t("products.categoryLabel")}
            </label>
            <SelectInput
              id={`cat-${product.slug}`}
              aria-label={t("products.categoryFor", { name: product.name })}
              value={product.category}
              onChange={(e) => onMove(product, e.target.value as CategorySlug)}
              className="h-10 w-40 text-[14px]"
            >
              {CATEGORY_SLUGS.map((slug) => (
                <option key={slug} value={slug}>
                  {catName(slug)}
                </option>
              ))}
            </SelectInput>
          </div>

          {alsoIn.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
              <span className="caps">{t("products.alsoIn")}</span>
              {alsoIn.map((c) => (
                <span key={c} className="border border-line bg-tile px-1.5 py-0.5 text-ink">
                  {catName(c)}
                </span>
              ))}
            </p>
          )}

          <p className="text-[14px] font-medium">
            {minPrice === maxPrice ? (
              <Price fils={minPrice} />
            ) : (
              <bdi className="figures whitespace-nowrap">
                <Price fils={minPrice} /> – <Price fils={maxPrice} />
              </bdi>
            )}
          </p>

          <p className="text-[13px] text-muted">
            {t("products.stock", { count: totalStock })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pt-1">
          <Action
            href={`/admin/products/edit?p=${encodeURIComponent(product.slug)}`}
            label={t("products.action.edit")}
            ariaLabel={t("products.action.edit")}
            icon={Pencil}
          />
          {product.hidden ? (
            <Action
              onClick={() => onToggleHidden(product)}
              label={t("products.action.show")}
              ariaLabel={t("products.action.showName", { name: product.name })}
              icon={Eye}
            />
          ) : (
            <Action
              onClick={() => onToggleHidden(product)}
              label={t("products.action.hide")}
              ariaLabel={t("products.action.hideName", { name: product.name })}
              icon={EyeOff}
            />
          )}
          <Action href={productHref(product.slug)} target="_blank" label={t("products.action.view")} icon={ExternalLink} />
          {edited && !custom && (
            <Action
              onClick={() => onReset(product.slug, product.name)}
              label={t("products.action.reset")}
              ariaLabel={t("products.action.resetName", { name: product.name })}
              icon={RotateCcw}
            />
          )}
          {custom && (
            <Action
              onClick={() => onDelete(product.slug, product.name)}
              label={t("products.action.delete")}
              ariaLabel={t("products.action.deleteName", { name: product.name })}
              icon={Trash2}
              tone="danger"
            />
          )}
        </div>
      </div>
    </li>
  );
}

// ── Collections panel ───────────────────────────────────────────────────────────

const field = (value: Localized | undefined): { en: string; ar: string } => ({
  en: value?.en ?? "",
  ar: value?.ar ?? "",
});

function CollectionsPanel() {
  const t = useTranslations("admin");
  const catalog = useLiveCatalog();

  return (
    <section className="border-t border-line pt-10">
      <h2 className="caps font-serif text-[24px] font-medium">{t("products.collections.title")}</h2>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">{t("products.collections.intro")}</p>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {catalog.categories.map((category) => (
          <CollectionEditor key={category.slug} slug={category.slug} name={category.name} description={category.description} />
        ))}
      </div>
    </section>
  );
}

function CollectionEditor({
  slug,
  name,
  description,
}: {
  slug: CategorySlug;
  name: Localized;
  description: Localized;
}) {
  const t = useTranslations("admin");
  const saveCategory = useCatalogStore((s) => s.saveCategory);
  const pushToast = useUi((s) => s.pushToast);
  const base = baseCategories.find((c) => c.slug === slug)!;

  const [form, setForm] = useState(() => ({ name: field(name), description: field(description) }));

  const save = () => {
    saveCategory(slug, {
      name: { en: form.name.en.trim(), ar: form.name.ar.trim() },
      description: { en: form.description.en.trim(), ar: form.description.ar.trim() },
    });
    pushToast({ title: t("products.collections.saved", { name: form.name.en.trim() || base.name.en }) });
  };

  const reset = () => {
    saveCategory(slug, {});
    setForm({ name: field(base.name), description: field(base.description) });
    pushToast({ title: t("products.collections.resetDone", { name: base.name.en }) });
  };

  const label = (key: string) => t(`products.collections.${key}`);

  return (
    <div className="border border-line bg-paper p-4" data-testid={`collection-${slug}`}>
      <h3 className="caps text-[13px] font-medium text-muted">{base.name.en}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Labeled id={`col-${slug}-name-en`} label={label("nameEn")}>
          <TextInput
            id={`col-${slug}-name-en`}
            value={form.name.en}
            onChange={(e) => setForm((f) => ({ ...f, name: { ...f.name, en: e.target.value } }))}
            className="h-10 text-[14px]"
            data-testid={`collection-${slug}-name-en`}
          />
        </Labeled>
        <Labeled id={`col-${slug}-name-ar`} label={label("nameAr")}>
          <TextInput
            id={`col-${slug}-name-ar`}
            dir="rtl"
            lang="ar"
            value={form.name.ar}
            onChange={(e) => setForm((f) => ({ ...f, name: { ...f.name, ar: e.target.value } }))}
            className="h-10 text-[14px]"
            data-testid={`collection-${slug}-name-ar`}
          />
        </Labeled>
        <Labeled id={`col-${slug}-desc-en`} label={label("descEn")}>
          <TextInput
            id={`col-${slug}-desc-en`}
            value={form.description.en}
            onChange={(e) => setForm((f) => ({ ...f, description: { ...f.description, en: e.target.value } }))}
            className="h-10 text-[14px]"
            data-testid={`collection-${slug}-desc-en`}
          />
        </Labeled>
        <Labeled id={`col-${slug}-desc-ar`} label={label("descAr")}>
          <TextInput
            id={`col-${slug}-desc-ar`}
            dir="rtl"
            lang="ar"
            value={form.description.ar}
            onChange={(e) => setForm((f) => ({ ...f, description: { ...f.description, ar: e.target.value } }))}
            className="h-10 text-[14px]"
            data-testid={`collection-${slug}-desc-ar`}
          />
        </Labeled>
      </div>
      <div className="mt-3 flex items-center gap-4">
        <button
          type="button"
          onClick={save}
          data-testid={`collection-${slug}-save`}
          className="caps inline-flex min-h-9 items-center border border-ink bg-transparent px-4 text-[12px] transition-colors hover:bg-ink hover:text-paper"
        >
          {label("save")}
        </button>
        <button
          type="button"
          onClick={reset}
          data-testid={`collection-${slug}-reset`}
          className="caps text-[12px] text-muted underline underline-offset-4 hover:text-ink"
        >
          {label("reset")}
        </button>
      </div>
    </div>
  );
}

function Labeled({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="caps mb-1 block text-[11px] text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}
