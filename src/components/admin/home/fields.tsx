"use client";

import { ArrowDown, ArrowUp, ImagePlus, Trash2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import type { Locale } from "@/i18n/routing";
import { ImageError, savePhotoUpload } from "@/lib/admin/image";
import type { DraftText } from "@/lib/admin/home-drafts";
import { CATEGORY_SLUGS, productHref, type Catalog } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import { PAGE_LINKS } from "@/lib/home";
import { hasImage } from "@/lib/media";
import { StorageFullError, type UploadKind } from "@/lib/uploads";
import { TextArea, TextInput, SelectInput } from "@/components/ui/form";
import { useUi } from "@/store/ui";
import { ImageLibraryDialog } from "../products/image-library-dialog";

// Shared field building blocks for the home-page editor. Each is controlled (value + onChange);
// none keeps its own draft state, so the editor's dirty tracking stays in one place.

/** Small square icon button (reorder / remove), with an accessible label. */
export function IconButton({
  onClick,
  disabled,
  label,
  icon: Icon,
  danger,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  icon: typeof ArrowUp;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "inline-flex size-9 items-center justify-center text-muted transition-colors disabled:opacity-30",
        danger ? "hover:text-danger" : "hover:text-ink",
      )}
    >
      <Icon className="size-4" strokeWidth={1.5} aria-hidden />
    </button>
  );
}

// ── Bilingual + plain text ────────────────────────────────────────────────────────

function Counter({ value, max }: { value: string; max: number }) {
  const t = useTranslations("admin");
  const len = value.trim().length;
  return (
    <span className={cn("figures text-[11px]", len > max ? "text-danger" : "text-muted")}>
      {t("homePage.counter", { n: len, max })}
    </span>
  );
}

/** EN (ltr) and AR (rtl) inputs side by side, each with a counter and a "Use original" link. */
export function BilingualText({
  section,
  field,
  label,
  value,
  original,
  limit,
  onChange,
  textarea = false,
}: {
  section: string;
  field: string;
  label: string;
  value: DraftText;
  original: DraftText;
  limit: number;
  onChange: (next: DraftText) => void;
  textarea?: boolean;
}) {
  const t = useTranslations("admin");
  const baseId = useId();
  const Control = textarea ? TextArea : TextInput;
  const columns: Array<{ lang: Locale; langLabel: string; dir: "ltr" | "rtl" }> = [
    { lang: "en", langLabel: t("editor.lang.en"), dir: "ltr" },
    { lang: "ar", langLabel: t("editor.lang.ar"), dir: "rtl" },
  ];

  return (
    <fieldset className="min-w-0">
      <legend className="text-[14px] text-ink">{label}</legend>
      <div className="mt-1.5 grid gap-3 sm:grid-cols-2">
        {columns.map(({ lang, langLabel, dir }) => {
          const differs = value[lang].trim() !== original[lang];
          const id = `${baseId}-${lang}`;
          return (
            <div key={lang} className="min-w-0">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <label htmlFor={id} className="caps text-[11px] text-muted">
                  {langLabel}
                </label>
                <Counter value={value[lang]} max={limit} />
              </div>
              <Control
                id={id}
                dir={dir}
                lang={lang === "ar" ? "ar" : undefined}
                value={value[lang]}
                maxLength={limit}
                aria-label={`${label} · ${langLabel}`}
                onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
                className={textarea ? "min-h-20 text-[14px]" : "h-11 text-[14px]"}
                data-testid={`home-${section}-${field}-${lang}`}
              />
              {differs && (
                <button
                  type="button"
                  onClick={() => onChange({ ...value, [lang]: original[lang] })}
                  className="caps mt-1 text-[11px] text-muted underline underline-offset-4 transition-colors hover:text-ink"
                >
                  {t("homePage.useOriginal")}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

/** A single plain-text input (the Arabic / English signature lines). */
export function PlainText({
  section,
  field,
  label,
  value,
  original,
  limit,
  dir = "ltr",
  lang,
  onChange,
}: {
  section: string;
  field: string;
  label: string;
  value: string;
  original: string;
  limit: number;
  dir?: "ltr" | "rtl";
  lang?: "ar";
  onChange: (next: string) => void;
}) {
  const t = useTranslations("admin");
  const id = useId();
  const differs = value.trim() !== original;
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[14px] text-ink">
          {label}
        </label>
        <Counter value={value} max={limit} />
      </div>
      <TextInput
        id={id}
        dir={dir}
        lang={lang}
        value={value}
        maxLength={limit}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 text-[14px]"
        data-testid={`home-${section}-${field}`}
      />
      {differs && (
        <button
          type="button"
          onClick={() => onChange(original)}
          className="caps mt-1 text-[11px] text-muted underline underline-offset-4 transition-colors hover:text-ink"
        >
          {t("homePage.useOriginal")}
        </button>
      )}
    </div>
  );
}

// ── Link select ──────────────────────────────────────────────────────────────────

const PAGE_KEYS: Record<(typeof PAGE_LINKS)[number], string> = {
  "/contact": "contact",
  "/faq": "faq",
  "/delivery": "delivery",
  "/refund-policy": "refundPolicy",
  "/privacy": "privacy",
  "/terms": "terms",
  "/orders": "orders",
};

/** A fixed dropdown of collections, visible products and pages — never free text. */
export function LinkSelect({
  section,
  label,
  value,
  catalog,
  locale,
  onChange,
}: {
  section: string;
  label: string;
  value: string;
  catalog: Catalog;
  locale: Locale;
  onChange: (href: string) => void;
}) {
  const t = useTranslations("admin");
  const id = useId();
  const collections = [
    { href: "/shop", name: t("homePage.links.allProducts") },
    ...catalog.categories.map((c) => ({ href: `/shop/${c.slug}`, name: c.name[locale] })),
  ];
  const products = catalog.visible.map((p) => ({ href: productHref(p.slug), name: p.name }));
  const pages = PAGE_LINKS.map((href) => ({ href, name: t(`homePage.links.${PAGE_KEYS[href]}`) }));

  const known = new Set([...collections, ...products, ...pages].map((o) => o.href));
  const unknown = !known.has(value);

  return (
    <div className="min-w-0">
      <label htmlFor={id} className="text-[14px] text-ink">
        {label}
      </label>
      <SelectInput
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 h-11 text-[14px]"
        data-testid={`home-${section}-link`}
      >
        {unknown && <option value={value}>{t("homePage.links.unknown")}</option>}
        <optgroup label={t("homePage.links.collections")}>
          {collections.map((o) => (
            <option key={o.href} value={o.href}>
              {o.name}
            </option>
          ))}
        </optgroup>
        <optgroup label={t("homePage.links.products")}>
          {products.map((o) => (
            <option key={o.href} value={o.href}>
              {o.name}
            </option>
          ))}
        </optgroup>
        <optgroup label={t("homePage.links.pages")}>
          {pages.map((o) => (
            <option key={o.href} value={o.href}>
              {o.name}
            </option>
          ))}
        </optgroup>
      </SelectInput>
      {unknown && <p className="mt-1 text-[12px] text-danger">{t("homePage.links.warning")}</p>}
    </div>
  );
}

// ── Product select (single) ─────────────────────────────────────────────────────────

/** A single-product dropdown grouped by main collection; hidden products are labelled. */
export function ProductSelect({
  section,
  label,
  value,
  catalog,
  locale,
  onChange,
}: {
  section: string;
  label: string;
  value: string;
  catalog: Catalog;
  locale: Locale;
  onChange: (slug: string) => void;
}) {
  const t = useTranslations("admin");
  const id = useId();
  const missing = value !== "" && !catalog.bySlug.has(value);

  return (
    <div className="min-w-0">
      <label htmlFor={id} className="text-[14px] text-ink">
        {label}
      </label>
      <SelectInput
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 h-11 text-[14px]"
        data-testid={`home-${section}-product`}
      >
        {missing && <option value={value}>{t("homePage.products.missing")}</option>}
        {CATEGORY_SLUGS.map((slug) => {
          const inCat = catalog.products.filter((p) => p.category === slug);
          if (inCat.length === 0) return null;
          const name = catalog.categories.find((c) => c.slug === slug)?.name[locale] ?? slug;
          return (
            <optgroup key={slug} label={name}>
              {inCat.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                  {p.hidden ? ` · ${t("homePage.products.hidden")}` : ""}
                </option>
              ))}
            </optgroup>
          );
        })}
      </SelectInput>
    </div>
  );
}

// ── Product list (ordered rows + add) ───────────────────────────────────────────────

/** An ordered list of products with reorder / remove and an "Add a product…" picker (max 8). */
export function ProductListField({
  section,
  value,
  catalog,
  locale,
  hint,
  onChange,
}: {
  section: string;
  value: string[];
  catalog: Catalog;
  locale: Locale;
  hint: string;
  onChange: (next: string[]) => void;
}) {
  const t = useTranslations("admin");
  const atLimit = value.length >= 8;
  const addable = catalog.products.filter((p) => !value.includes(p.slug));

  const move = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  };
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));
  const add = (slug: string) => {
    if (!slug || atLimit || value.includes(slug)) return;
    onChange([...value, slug]);
  };

  return (
    <div>
      {value.length === 0 ? (
        <p className="text-[13px] text-muted">{t("homePage.products.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {value.map((slug, index) => {
            const product = catalog.bySlug.get(slug);
            const name = product?.name ?? slug;
            return (
              <li key={slug} className="flex items-center gap-3 border border-line bg-paper p-2">
                <div className="relative size-12 shrink-0 overflow-hidden border border-line bg-tile">
                  {product && <ResponsiveImage image={product.images.card} alt="" sizes="48px" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px]">
                    <bdi lang="en">{name}</bdi>
                    {product && <span className="text-[12px] text-muted"> · {product.type[locale]}</span>}
                  </p>
                  {!product && <span className="caps text-[11px] text-danger">{t("homePage.products.missing")}</span>}
                  {product?.hidden && <span className="caps text-[11px] text-danger">{t("homePage.products.hidden")}</span>}
                </div>
                <div className="flex shrink-0 items-center">
                  <IconButton onClick={() => move(index, -1)} disabled={index === 0} label={t("homePage.products.moveUp", { name })} icon={ArrowUp} />
                  <IconButton onClick={() => move(index, 1)} disabled={index === value.length - 1} label={t("homePage.products.moveDown", { name })} icon={ArrowDown} />
                  <IconButton onClick={() => remove(index)} label={t("homePage.products.remove", { name })} icon={Trash2} danger />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3">
        <SelectInput
          value=""
          disabled={atLimit}
          onChange={(e) => add(e.target.value)}
          className="h-11 text-[14px]"
          data-testid={`home-${section}-products-add`}
          aria-label={t("homePage.products.add")}
        >
          <option value="">{t("homePage.products.add")}</option>
          {addable.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name}
              {p.hidden ? ` · ${t("homePage.products.hidden")}` : ""}
            </option>
          ))}
        </SelectInput>
        <p className="mt-1.5 text-[12px] text-muted">{hint}</p>
      </div>
    </div>
  );
}

// ── Image field ──────────────────────────────────────────────────────────────────

/** One photo slot: a thumbnail with its state, Choose / Upload / Use-default actions, and a hint. */
export function ImageField({
  section,
  slot,
  label,
  value,
  fallback,
  mode,
  emptyLabel,
  shapeHint,
  thumbClass = "aspect-square",
  kind,
  uploadOpts,
  onChange,
}: {
  section: string;
  slot: string;
  label: string;
  /** The stored key ("" = none: show the fallback). */
  value: string;
  /** What shows when nothing is chosen (the original tile or the product's automatic photo). */
  fallback: string;
  mode: "original" | "automatic";
  /** Label for the empty state (defaults to Original / Automatic). */
  emptyLabel?: string;
  shapeHint?: string;
  thumbClass?: string;
  kind: UploadKind;
  uploadOpts?: { maxSide?: number; maxChars?: number };
  onChange: (key: string) => void;
}) {
  const t = useTranslations("admin");
  const pushToast = useUi((s) => s.pushToast);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // A stored upload that no longer exists is treated as empty for display (show the fallback).
  const valueExists = value !== "" && hasImage(value);
  const deleted = value !== "" && !valueExists;
  const effective = valueExists ? value : fallback;
  const stateLabel = valueExists
    ? t("homePage.photo.yours")
    : (emptyLabel ?? t(mode === "automatic" ? "homePage.photo.automatic" : "homePage.photo.original"));

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const key = await savePhotoUpload(file, kind, uploadOpts);
      onChange(key);
    } catch (error) {
      if (error instanceof StorageFullError) pushToast({ title: t("editor.photos.storageFull") });
      else if (error instanceof ImageError) pushToast({ title: t(`editor.photos.err.${error.key}`) });
      else pushToast({ title: t("editor.photos.uploadError") });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-w-0">
      <p className="text-[14px] text-ink">{label}</p>
      <div className="mt-1.5 flex items-start gap-4">
        <div
          data-image={effective}
          className={cn("relative w-28 shrink-0 overflow-hidden border border-line bg-tile", thumbClass)}
        >
          {effective ? <ResponsiveImage image={effective} alt="" sizes="112px" /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="caps text-[11px] text-muted">{stateLabel}</p>
          {deleted && <p className="mt-1 text-[12px] text-muted">{t("homePage.photo.deleted")}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setLibraryOpen(true)}
              data-testid={`home-${section}-${slot}-choose`}
              className="caps inline-flex min-h-9 items-center gap-1.5 border border-ink px-3 text-[12px] transition-colors hover:bg-ink hover:text-paper"
            >
              <ImagePlus className="size-3.5" strokeWidth={1.5} aria-hidden />
              {t("homePage.photo.choose")}
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="caps inline-flex min-h-9 items-center gap-1.5 border border-ink px-3 text-[12px] transition-colors hover:bg-ink hover:text-paper disabled:opacity-40"
            >
              <Upload className="size-3.5" strokeWidth={1.5} aria-hidden />
              {uploading ? t("homePage.photo.uploading") : t("homePage.photo.upload")}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              aria-label={`${label} · ${t("homePage.photo.upload")}`}
              onChange={onFile}
              data-testid={`home-${section}-${slot}-upload-input`}
            />
          </div>
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="caps mt-2 block text-[12px] text-muted underline underline-offset-4 transition-colors hover:text-ink"
            >
              {t(mode === "automatic" ? "homePage.photo.useAutomatic" : "homePage.photo.useOriginal")}
            </button>
          )}
          {shapeHint && <p className="mt-2 text-[12px] text-muted">{shapeHint}</p>}
        </div>
      </div>

      <ImageLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        existing={effective ? [effective] : []}
        remaining={1}
        single
        // Re-picking the current original/automatic photo stores "" (keep the default), not a pin.
        onAdd={(keys) => onChange(keys[0] && keys[0] !== fallback ? keys[0] : "")}
      />
    </div>
  );
}
