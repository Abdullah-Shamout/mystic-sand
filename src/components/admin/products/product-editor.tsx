"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FormProvider,
  useFieldArray,
  useFormContext,
  useForm,
  useWatch,
  type Control,
} from "react-hook-form";
import { z } from "zod";
import { ProductCard } from "@/components/product/product-card";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextArea, TextInput } from "@/components/ui/form";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { Skeleton } from "@/components/ui/skeleton";
import type { CategorySlug, Product } from "@/data/types";
import { Link, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { ImageError, compressImage } from "@/lib/admin/image";
import { baseCatalog, CATEGORY_SLUGS, productHref } from "@/lib/catalog";
import { toLatinDigits } from "@/lib/digits";
import { useMounted } from "@/lib/hooks";
import { getLiveCatalog, useLiveCatalog } from "@/lib/live";
import { normalizeSearch } from "@/lib/search";
import { storageUsage } from "@/lib/storage";
import { saveUpload, StorageFullError, UPLOAD_PREFIX } from "@/lib/uploads";
import { useCatalogStore } from "@/store/catalog";
import { useUi } from "@/store/ui";
import { ImageLibraryDialog } from "./image-library-dialog";

const MAX_PHOTOS = 6;
const STORAGE_BUDGET = 4_500_000;

const TYPE_PRESETS: Array<{ en: string; ar: string }> = [
  { en: "Eau de Parfum", ar: "ماء عطر" },
  { en: "All Over Spray", ar: "بخاخ معطّر للجسم" },
  { en: "Room & Linen Spray", ar: "معطّر للغرف والمفارش" },
  { en: "Natural Agarwood · Bakhoor", ar: "عود طبيعي · بخور" },
];

// ── Validation ────────────────────────────────────────────────────────────────

/** KWD string (Arabic digits accepted, up to 3 decimals, 0–1000) → integer fils, or null. */
function parsePriceFils(input: string): number | null {
  const s = toLatinDigits(input ?? "").trim();
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return null;
  const kwd = Number(s);
  if (!Number.isFinite(kwd) || kwd < 0 || kwd > 1000) return null;
  return Math.round(kwd * 1000);
}

function parseStock(input: string): number | null {
  const s = toLatinDigits(input ?? "").trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

const variantSchema = z.object({
  sku: z.string(),
  sizeEn: z.string().trim().min(1, "sizeRequired"),
  sizeAr: z.string().trim().min(1, "sizeRequired"),
  price: z.string().refine((v) => parsePriceFils(v) !== null, "priceInvalid"),
  stock: z.string().refine((v) => parseStock(v) !== null, "stockInvalid"),
});

const schema = z.object({
  name: z.string().trim().min(1, "nameRequired").max(40, "nameTooLong"),
  category: z.enum(["perfumes", "oud", "body", "home"]),
  alsoIn: z.array(z.enum(["perfumes", "oud", "body", "home"])),
  badge: z.boolean(),
  visible: z.boolean(),
  typeEn: z.string().trim().min(1, "typeRequired"),
  typeAr: z.string().trim().min(1, "typeRequired"),
  familyEn: z.string(),
  familyAr: z.string(),
  taglineEn: z.string(),
  taglineAr: z.string(),
  descriptionEn: z.string().trim().min(1, "descriptionRequired"),
  descriptionAr: z.string().trim().min(1, "descriptionRequired"),
  howToEn: z.string(),
  howToAr: z.string(),
  variants: z.array(variantSchema).min(1, "variantsRequired"),
  images: z.array(z.object({ key: z.string().min(1) })).min(1, "imagesRequired"),
  cardKey: z.string(),
  hoverKey: z.string(),
  aliases: z.string(),
  related: z.array(z.string()),
});

type EditorForm = z.infer<typeof schema>;

// ── Form <-> product mapping ────────────────────────────────────────────────────

/** All distinct image keys of a product (gallery, plus card/hover if not already there). */
function imageKeysOf(product: Product): string[] {
  const keys = [...product.images.gallery];
  if (product.images.card && !keys.includes(product.images.card)) keys.unshift(product.images.card);
  if (product.images.hover && !keys.includes(product.images.hover)) keys.push(product.images.hover);
  return keys;
}

function toForm(product: Product | undefined): EditorForm {
  if (!product) {
    return {
      name: "",
      category: "perfumes",
      alsoIn: [],
      badge: false,
      visible: true,
      typeEn: "",
      typeAr: "",
      familyEn: "",
      familyAr: "",
      taglineEn: "",
      taglineAr: "",
      descriptionEn: "",
      descriptionAr: "",
      howToEn: "",
      howToAr: "",
      variants: [{ sku: "", sizeEn: "", sizeAr: "", price: "", stock: "" }],
      images: [],
      cardKey: "",
      hoverKey: "",
      aliases: "",
      related: [],
    };
  }
  return {
    name: product.name,
    category: product.category,
    alsoIn: (product.alsoIn ?? []).filter((c) => c !== product.category),
    badge: product.badge === "new",
    visible: !product.hidden,
    typeEn: product.type.en,
    typeAr: product.type.ar,
    familyEn: product.family?.en ?? "",
    familyAr: product.family?.ar ?? "",
    taglineEn: product.tagline.en,
    taglineAr: product.tagline.ar,
    descriptionEn: product.description.en,
    descriptionAr: product.description.ar,
    howToEn: product.howTo.en,
    howToAr: product.howTo.ar,
    variants: product.variants.map((v) => ({
      sku: v.sku,
      sizeEn: v.size.en,
      sizeAr: v.size.ar,
      price: (v.priceFils / 1000).toFixed(3),
      stock: String(v.stock),
    })),
    images: imageKeysOf(product).map((key) => ({ key })),
    cardKey: product.images.card,
    hoverKey: product.images.hover ?? "",
    aliases: product.aliases.join(", "),
    related: product.related,
  };
}

const SKU_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function randomSku(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += SKU_CHARS[Math.floor(Math.random() * SKU_CHARS.length)];
  return `MS-${s}`;
}
function uniqueSku(used: Set<string>): string {
  let sku = randomSku();
  while (used.has(sku)) sku = randomSku();
  return sku;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "product";
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6).padEnd(4, "x");
}

// ── Skeleton & entry ────────────────────────────────────────────────────────────

export function ProductEditorSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-6" aria-busy>
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function ProductEditor() {
  const params = useSearchParams();
  const mounted = useMounted();
  const slug = params.get("p") ?? "new";
  if (!mounted) return <ProductEditorSkeleton />;
  return <EditorLoaded slug={slug} key={slug} />;
}

function EditorLoaded({ slug }: { slug: string }) {
  const t = useTranslations("admin");
  const catalog = useLiveCatalog();
  const isNew = slug === "new";
  const existing = isNew ? undefined : catalog.bySlug.get(slug);

  if (!isNew && !existing) {
    return (
      <div className="mx-auto max-w-xl py-12 text-center">
        <h1 className="caps font-serif text-title font-medium">{t("editor.notFound.title")}</h1>
        <p className="mt-3 text-[15px] text-muted">{t("editor.notFound.message")}</p>
        <Link
          href="/admin/products"
          className="caps mt-6 inline-flex min-h-11 items-center border border-ink px-4 text-[13px] transition-colors hover:bg-ink hover:text-paper"
        >
          {t("editor.notFound.back")}
        </Link>
      </div>
    );
  }

  return <EditorForm existing={existing} isNew={isNew} slug={slug} />;
}

// ── The form ─────────────────────────────────────────────────────────────────

function EditorForm({ existing, isNew, slug }: { existing: Product | undefined; isNew: boolean; slug: string }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const pushToast = useUi((s) => s.pushToast);

  const [defaults] = useState(() => toForm(existing));

  const form = useForm<EditorForm>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: defaults,
  });
  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty, isSubmitting },
  } = form;

  // Warn before closing the tab with unsaved changes (ignored for client navigation).
  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const onValid = (values: EditorForm) => {
    const liveCatalog = getLiveCatalog();
    const used = new Set(liveCatalog.bySku.keys());

    const variants = values.variants.map((v) => {
      let sku = v.sku.trim();
      if (!sku) sku = uniqueSku(used);
      used.add(sku);
      return {
        sku,
        size: { en: v.sizeEn.trim(), ar: v.sizeAr.trim() },
        priceFils: parsePriceFils(v.price)!,
        stock: parseStock(v.stock)!,
      };
    });

    const gallery = values.images.map((i) => i.key);
    const cardKey = values.cardKey || gallery[0] || "";
    const hoverKey = values.hoverKey && values.hoverKey !== cardKey ? values.hoverKey : undefined;

    // The photo list is normalised on load (card/hover folded into the gallery), so writing it
    // back would change an existing product's gallery even when the admin never touched a photo.
    // Keep the original images untouched unless the Photos section actually changed.
    const photosUnchanged =
      existing !== undefined &&
      values.cardKey === defaults.cardKey &&
      values.hoverKey === defaults.hoverKey &&
      values.images.length === defaults.images.length &&
      values.images.every((im, i) => im.key === defaults.images[i].key);
    const images =
      photosUnchanged && existing
        ? existing.images
        : { card: cardKey, ...(hoverKey ? { hover: hoverKey } : {}), gallery };

    const familyEn = values.familyEn.trim();
    const familyAr = values.familyAr.trim();

    const finalSlug = isNew ? `c-${slugify(values.name)}-${randomSuffix()}` : slug;
    const basis = isNew
      ? {}
      : (baseCatalog.bySlug.get(slug) ?? liveCatalog.bySlug.get(slug) ?? {});

    const product = {
      ...(basis as Partial<Product>),
      slug: finalSlug,
      name: values.name.trim(),
      category: values.category,
      alsoIn: values.alsoIn.filter((c) => c !== values.category),
      type: { en: values.typeEn.trim(), ar: values.typeAr.trim() },
      family: familyEn || familyAr ? { en: familyEn, ar: familyAr } : undefined,
      tagline: { en: values.taglineEn.trim(), ar: values.taglineAr.trim() },
      description: { en: values.descriptionEn.trim(), ar: values.descriptionAr.trim() },
      howTo: { en: values.howToEn.trim(), ar: values.howToAr.trim() },
      variants,
      images,
      badge: values.badge ? ("new" as const) : undefined,
      related: values.related,
      aliases: values.aliases.split(",").map((s) => s.trim()).filter(Boolean),
      hidden: values.visible ? undefined : true,
      todo: [] as Product["todo"],
    } as Product;

    const store = useCatalogStore.getState();
    if (isNew) store.createProduct(product);
    else store.saveProduct(slug, product);

    // Uploaded photos stay in the reusable library on save: they are only ever removed from the
    // library dialog or Settings → Data → "Delete unused photos".

    reset(values);
    pushToast({ title: t("editor.saved", { name: product.name }) });
    router.push("/admin/products");
  };

  const title = isNew ? t("editor.newTitle") : t("editor.editTitle", { name: existing?.name ?? "" });

  return (
    <FormProvider {...form}>
      <form onSubmit={(e) => handleSubmit(onValid)(e)} noValidate className="pb-20">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/admin/products" className="caps text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline">
              ← {t("editor.backToList")}
            </Link>
            <h1 className="caps font-serif text-title font-medium">
              <bdi>{title}</bdi>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {!isNew && (
              <Link
                href={productHref(slug)}
                target="_blank"
                rel="noopener noreferrer"
                className="caps text-[13px] underline-offset-4 hover:underline"
              >
                {t("editor.view")}
              </Link>
            )}
            <Button type="submit" size="sm" busy={isSubmitting} data-testid="editor-save">
              {t("editor.save")}
            </Button>
          </div>
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
          <div className="min-w-0 space-y-12">
            <BasicsSection />
            <TextSection />
            <VariantsSection control={control} />
            <PhotosSection />
            <OptionsSection slug={slug} isNew={isNew} />
          </div>

          <aside className="lg:sticky lg:top-24">
            <PreviewPanel control={control} />
          </aside>
        </div>
      </form>
    </FormProvider>
  );
}

// ── Sections ────────────────────────────────────────────────────────────────

function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="border-b border-line pb-2">
      <h2 className="caps font-serif text-[22px] font-medium">{title}</h2>
      {hint && <p className="mt-1 text-[13px] text-muted">{hint}</p>}
    </div>
  );
}

function useErrorText() {
  const t = useTranslations("admin");
  return (key?: string): string | undefined => {
    if (!key) return undefined;
    return t.has(`editor.errors.${key}`) ? t(`editor.errors.${key}`) : t("editor.errors.generic");
  };
}

function BasicsSection() {
  const t = useTranslations("admin");
  const locale = useLocale() as Locale;
  const catalog = useLiveCatalog();
  const et = useErrorText();
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<EditorForm>();
  const mainCategory = useWatch({ control, name: "category" });
  const catName = (slug: CategorySlug) => catalog.categories.find((c) => c.slug === slug)?.name[locale] ?? slug;

  return (
    <section className="space-y-5">
      <SectionHeading title={t("editor.sections.basics")} />
      <Field label={t("editor.basics.name")} hint={t("editor.basics.nameHint")} error={et(errors.name?.message)}>
        {({ id, describedBy, invalid }) => (
          <TextInput
            id={id}
            dir="ltr"
            maxLength={40}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            data-testid="editor-name"
            {...register("name")}
          />
        )}
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t("editor.basics.category")}>
          {({ id }) => (
            <SelectInput id={id} data-testid="editor-category" {...register("category")}>
              {CATEGORY_SLUGS.map((slug) => (
                <option key={slug} value={slug}>
                  {catName(slug)}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>

        <fieldset className="min-w-0">
          <legend className="text-[14px] text-ink">{t("editor.basics.alsoIn")}</legend>
          <p className="mb-2 text-[13px] text-muted">{t("editor.basics.alsoInHint")}</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {CATEGORY_SLUGS.filter((slug) => slug !== mainCategory).map((slug) => (
              <label key={slug} className="flex min-h-9 cursor-pointer items-center gap-2 text-[14px]">
                <input type="checkbox" value={slug} className="size-[18px] accent-racing" {...register("alsoIn")} />
                {catName(slug)}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-2">
        <label className="flex min-h-9 cursor-pointer items-center gap-2 text-[14px]">
          <input type="checkbox" className="size-[18px] accent-racing" data-testid="editor-visible" {...register("visible")} />
          {t("editor.basics.visible")}
        </label>
        <label className="flex min-h-9 cursor-pointer items-center gap-2 text-[14px]">
          <input type="checkbox" className="size-[18px] accent-racing" data-testid="editor-badge" {...register("badge")} />
          {t("editor.basics.badgeNew")}
        </label>
      </div>
    </section>
  );
}

function BilingualField({
  base,
  labelKey,
  textarea = false,
  required = false,
}: {
  base: "type" | "family" | "tagline" | "description" | "howTo";
  labelKey: string;
  textarea?: boolean;
  required?: boolean;
}) {
  const t = useTranslations("admin");
  const et = useErrorText();
  const {
    register,
    formState: { errors },
  } = useFormContext<EditorForm>();
  const enName = `${base}En` as keyof EditorForm;
  const arName = `${base}Ar` as keyof EditorForm;
  const Control = textarea ? TextArea : TextInput;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        label={`${t(labelKey)} · ${t("editor.lang.en")}`}
        optional={required ? undefined : t("editor.optional")}
        error={et((errors[enName] as { message?: string } | undefined)?.message)}
      >
        {({ id, describedBy, invalid }) => (
          <Control
            id={id}
            dir="ltr"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            data-testid={`editor-${base}-en`}
            {...register(enName)}
          />
        )}
      </Field>
      <Field
        label={`${t(labelKey)} · ${t("editor.lang.ar")}`}
        optional={required ? undefined : t("editor.optional")}
        error={et((errors[arName] as { message?: string } | undefined)?.message)}
      >
        {({ id, describedBy, invalid }) => (
          <Control
            id={id}
            dir="rtl"
            lang="ar"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            data-testid={`editor-${base}-ar`}
            {...register(arName)}
          />
        )}
      </Field>
    </div>
  );
}

function TextSection() {
  const t = useTranslations("admin");
  const { setValue } = useFormContext<EditorForm>();

  return (
    <section className="space-y-6">
      <SectionHeading title={t("editor.sections.text")} hint={t("editor.text.hint")} />

      <div className="space-y-2">
        <BilingualField base="type" labelKey="editor.text.type" required />
        <div className="flex flex-wrap gap-2">
          <span className="caps self-center text-[12px] text-muted">{t("editor.text.presets")}</span>
          {TYPE_PRESETS.map((preset) => (
            <button
              key={preset.en}
              type="button"
              onClick={() => {
                setValue("typeEn", preset.en, { shouldDirty: true, shouldValidate: true });
                setValue("typeAr", preset.ar, { shouldDirty: true, shouldValidate: true });
              }}
              className="caps border border-line bg-tile px-2.5 py-1 text-[12px] transition-colors hover:border-ink"
            >
              {preset.en}
            </button>
          ))}
        </div>
      </div>

      <BilingualField base="family" labelKey="editor.text.family" />
      <BilingualField base="tagline" labelKey="editor.text.tagline" />
      <BilingualField base="description" labelKey="editor.text.description" textarea required />
      <BilingualField base="howTo" labelKey="editor.text.howTo" textarea />
    </section>
  );
}

function VariantsSection({ control }: { control: Control<EditorForm> }) {
  const t = useTranslations("admin");
  const et = useErrorText();
  const {
    register,
    formState: { errors },
  } = useFormContext<EditorForm>();
  const fa = useFieldArray({ control, name: "variants" });

  return (
    <section className="space-y-4">
      <SectionHeading title={t("editor.sections.variants")} hint={t("editor.variants.hint")} />
      {errors.variants?.message && <p className="text-[13px] text-danger">{et(errors.variants.message)}</p>}

      <ul className="space-y-4">
        {fa.fields.map((f, i) => {
          const err = errors.variants?.[i];
          return (
            <li key={f.id} className="border border-line bg-paper p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={`${t("editor.variants.size")} · ${t("editor.lang.en")}`} error={et(err?.sizeEn?.message)}>
                  {({ id, invalid }) => (
                    <TextInput
                      id={id}
                      dir="ltr"
                      aria-invalid={invalid || undefined}
                      className="h-11"
                      data-testid={`editor-variant-size-en-${i}`}
                      {...register(`variants.${i}.sizeEn` as const)}
                    />
                  )}
                </Field>
                <Field label={`${t("editor.variants.size")} · ${t("editor.lang.ar")}`} error={et(err?.sizeAr?.message)}>
                  {({ id, invalid }) => (
                    <TextInput
                      id={id}
                      dir="rtl"
                      lang="ar"
                      aria-invalid={invalid || undefined}
                      className="h-11"
                      data-testid={`editor-variant-size-ar-${i}`}
                      {...register(`variants.${i}.sizeAr` as const)}
                    />
                  )}
                </Field>
                <Field label={t("editor.variants.price")} hint={t("editor.variants.priceHint")} error={et(err?.price?.message)}>
                  {({ id, invalid }) => (
                    <TextInput
                      id={id}
                      dir="ltr"
                      inputMode="decimal"
                      aria-invalid={invalid || undefined}
                      className="h-11"
                      data-testid={`editor-variant-price-${i}`}
                      {...register(`variants.${i}.price` as const)}
                    />
                  )}
                </Field>
                <Field label={t("editor.variants.stock")} error={et(err?.stock?.message)}>
                  {({ id, invalid }) => (
                    <TextInput
                      id={id}
                      dir="ltr"
                      inputMode="numeric"
                      aria-invalid={invalid || undefined}
                      className="h-11"
                      data-testid={`editor-variant-stock-${i}`}
                      {...register(`variants.${i}.stock` as const)}
                    />
                  )}
                </Field>
              </div>
              <div className="mt-3 flex items-center justify-between gap-4">
                <p className="text-[12px] text-muted">
                  {t("editor.variants.sku")}:{" "}
                  <bdi dir="ltr" className="figures">
                    {f.sku || t("editor.variants.skuNew")}
                  </bdi>
                </p>
                {fa.fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => fa.remove(i)}
                    className="caps inline-flex items-center gap-1 text-[12px] text-danger underline-offset-4 hover:underline"
                  >
                    <Trash2 className="size-3.5" strokeWidth={1.5} aria-hidden />
                    {t("editor.variants.remove")}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => fa.append({ sku: "", sizeEn: "", sizeAr: "", price: "", stock: "" })}
        className="caps inline-flex min-h-10 items-center gap-1.5 border border-ink px-4 text-[12px] transition-colors hover:bg-ink hover:text-paper"
      >
        <Plus className="size-4" strokeWidth={1.5} aria-hidden />
        {t("editor.variants.add")}
      </button>
    </section>
  );
}

function PhotosSection() {
  const t = useTranslations("admin");
  const et = useErrorText();
  const pushToast = useUi((s) => s.pushToast);
  const {
    control,
    getValues,
    setValue,
    formState: { errors },
  } = useFormContext<EditorForm>();
  const fa = useFieldArray({ control, name: "images" });
  const cardKey = useWatch({ control, name: "cardKey" });
  const hoverKey = useWatch({ control, name: "hoverKey" });

  const [libraryOpen, setLibraryOpen] = useState(false);
  const [studio, setStudio] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [storageTick, setStorageTick] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const meter = useMemo(() => {
    void storageTick; // recompute after each upload / removal
    const { totalChars } = storageUsage();
    return Math.min(100, Math.round((totalChars / STORAGE_BUDGET) * 100));
  }, [storageTick]);

  const atLimit = fa.fields.length >= MAX_PHOTOS;

  const appendPhoto = (key: string) => {
    if ((getValues("images") ?? []).some((i) => i.key === key)) return;
    fa.append({ key });
    if (!getValues("cardKey")) setValue("cardKey", key, { shouldDirty: true, shouldValidate: true });
  };

  const onAddLibrary = (keys: string[]) => {
    for (const key of keys) {
      if ((getValues("images") ?? []).length >= MAX_PHOTOS) break;
      appendPhoto(key);
    }
  };

  const removePhoto = (index: number) => {
    const key = fa.fields[index]?.key ?? "";
    fa.remove(index);
    const remaining = getValues("images") ?? [];
    if (getValues("cardKey") === key) setValue("cardKey", remaining[0]?.key ?? "", { shouldDirty: true });
    if (getValues("hoverKey") === key) setValue("hoverKey", "", { shouldDirty: true });
  };

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (atLimit) {
      pushToast({ title: t("editor.photos.maxReached") });
      return;
    }
    setUploading(true);
    try {
      const upload = await compressImage(file, studio ? "packshot" : "photo");
      const id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, "");
      saveUpload(id, upload);
      appendPhoto(`${UPLOAD_PREFIX}${id}`);
      setStorageTick((n) => n + 1);
    } catch (error) {
      if (error instanceof StorageFullError) pushToast({ title: t("editor.photos.storageFull") });
      else if (error instanceof ImageError) pushToast({ title: t(`editor.photos.err.${error.key}`) });
      else pushToast({ title: t("editor.photos.uploadError") });
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="space-y-4">
      <SectionHeading title={t("editor.sections.photos")} hint={t("editor.photos.hint")} />
      {errors.images?.message && (
        <p className="text-[13px] text-danger" data-testid="editor-photos-error">
          {et(errors.images.message)}
        </p>
      )}

      {fa.fields.length > 0 && (
        <ul className="space-y-2" data-testid="editor-photos">
          {fa.fields.map((f, i) => (
            <li key={f.id} className="flex items-center gap-3 border border-line bg-paper p-2">
              <div className="relative size-16 shrink-0 overflow-hidden border border-line bg-tile">
                <ResponsiveImage image={f.key} alt="" sizes="64px" />
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px]">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="card-pick"
                    className="size-4 accent-racing"
                    checked={cardKey === f.key}
                    onChange={() => setValue("cardKey", f.key, { shouldDirty: true, shouldValidate: true })}
                  />
                  {t("editor.photos.thumbnail")}
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="hover-pick"
                    className="size-4 accent-racing"
                    checked={hoverKey === f.key}
                    onChange={() => setValue("hoverKey", f.key, { shouldDirty: true })}
                  />
                  {t("editor.photos.cardPhoto")}
                </label>
              </div>
              <div className="ms-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => fa.move(i, i - 1)}
                  disabled={i === 0}
                  aria-label={t("editor.photos.moveUp")}
                  className="inline-flex size-9 items-center justify-center text-muted transition-colors hover:text-ink disabled:opacity-30"
                >
                  <ArrowUp className="size-4" strokeWidth={1.5} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => fa.move(i, i + 1)}
                  disabled={i === fa.fields.length - 1}
                  aria-label={t("editor.photos.moveDown")}
                  className="inline-flex size-9 items-center justify-center text-muted transition-colors hover:text-ink disabled:opacity-30"
                >
                  <ArrowDown className="size-4" strokeWidth={1.5} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  aria-label={t("editor.photos.remove")}
                  className="inline-flex size-9 items-center justify-center text-muted transition-colors hover:text-danger"
                >
                  <Trash2 className="size-4" strokeWidth={1.5} aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {hoverKey && (
        <button
          type="button"
          onClick={() => setValue("hoverKey", "", { shouldDirty: true })}
          className="caps text-[12px] text-muted underline underline-offset-4 hover:text-ink"
        >
          {t("editor.photos.noCardPhoto")}
        </button>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setLibraryOpen(true)}
          disabled={atLimit}
          data-testid="editor-add-library"
          className="caps inline-flex min-h-10 items-center gap-1.5 border border-ink px-4 text-[12px] transition-colors hover:bg-ink hover:text-paper disabled:opacity-40"
        >
          <ImagePlus className="size-4" strokeWidth={1.5} aria-hidden />
          {t("editor.photos.addFromLibrary")}
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={atLimit || uploading}
          className="caps inline-flex min-h-10 items-center gap-1.5 border border-ink px-4 text-[12px] transition-colors hover:bg-ink hover:text-paper disabled:opacity-40"
        >
          <Upload className="size-4" strokeWidth={1.5} aria-hidden />
          {uploading ? t("editor.photos.uploading") : t("editor.photos.upload")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onFile}
          data-testid="editor-upload-input"
        />
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted">
        <input type="checkbox" checked={studio} onChange={(e) => setStudio(e.target.checked)} className="size-[18px] accent-racing" />
        {t("editor.photos.studio")}
      </label>

      <p className="text-[12px] text-muted">{t("editor.photos.count", { count: fa.fields.length, max: MAX_PHOTOS })}</p>

      <div>
        <div className="h-1.5 w-full max-w-xs overflow-hidden bg-tile">
          <div className="h-full bg-racing" style={{ width: `${meter}%` }} />
        </div>
        <p className="mt-1 text-[12px] text-muted">{t("editor.photos.storage", { percent: meter })}</p>
      </div>

      <ImageLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        existing={(getValues("images") ?? []).map((i) => i.key)}
        remaining={MAX_PHOTOS - fa.fields.length}
        onAdd={onAddLibrary}
      />
    </section>
  );
}

function OptionsSection({ slug, isNew }: { slug: string; isNew: boolean }) {
  const t = useTranslations("admin");
  const locale = useLocale() as Locale;
  const catalog = useLiveCatalog();
  const { register, control } = useFormContext<EditorForm>();
  const [relatedQuery, setRelatedQuery] = useState("");
  const selected = useWatch({ control, name: "related" }) ?? [];

  // Every product in the live catalog (base, edited and custom — newest included) except the one
  // being edited, narrowed by the search box; already-selected products always stay visible.
  const others = catalog.products.filter((p) => p.slug !== slug || isNew);
  const q = normalizeSearch(relatedQuery);
  const shown = q
    ? others.filter(
        (p) =>
          selected.includes(p.slug) ||
          normalizeSearch(`${p.name} ${p.type.en} ${p.type[locale]} ${p.aliases.join(" ")}`).includes(q),
      )
    : others;

  return (
    <section className="space-y-5">
      <SectionHeading title={t("editor.sections.options")} />
      <Field label={t("editor.options.aliases")} hint={t("editor.options.aliasesHint")} optional={t("editor.optional")}>
        {({ id, describedBy }) => (
          <TextInput id={id} aria-describedby={describedBy} data-testid="editor-aliases" {...register("aliases")} />
        )}
      </Field>

      <fieldset>
        <legend className="text-[14px] text-ink">{t("editor.options.related")}</legend>
        <p className="mb-2 text-[13px] text-muted">{t("editor.options.relatedHint")}</p>
        <TextInput
          type="search"
          value={relatedQuery}
          placeholder={t("editor.options.relatedSearch")}
          aria-label={t("editor.options.relatedSearch")}
          onChange={(e) => setRelatedQuery(e.target.value)}
          className="mb-2 h-10 text-[14px]"
          data-testid="editor-related-search"
        />
        <div className="max-h-48 overflow-y-auto border border-line bg-paper p-3">
          {shown.length === 0 ? (
            <p className="py-2 text-[13px] text-muted">{t("editor.options.relatedEmpty")}</p>
          ) : (
            <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {shown.map((p) => (
                <label key={p.slug} className="flex min-h-8 cursor-pointer items-center gap-2 text-[14px]">
                  <input type="checkbox" value={p.slug} className="size-[18px] accent-racing" {...register("related")} />
                  <bdi lang="en">{p.name}</bdi>
                  <span className="text-[12px] text-muted">· {p.type[locale]}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </fieldset>
    </section>
  );
}

function PreviewPanel({ control }: { control: Control<EditorForm> }) {
  const t = useTranslations("admin");
  const values = useWatch({ control });

  const previewVariants = (values.variants ?? []).map((v) => ({
    sku: v?.sku || "preview",
    size: { en: v?.sizeEn || "", ar: v?.sizeAr || "" },
    priceFils: parsePriceFils(v?.price ?? "") ?? 0,
    stock: parseStock(v?.stock ?? "") ?? 0,
  }));
  if (previewVariants.length === 0) {
    previewVariants.push({ sku: "preview", size: { en: "", ar: "" }, priceFils: 0, stock: 0 });
  }

  const gallery = (values.images ?? []).map((i) => i?.key).filter((k): k is string => Boolean(k));
  const cardKey = values.cardKey || gallery[0] || "";
  const hoverKey = values.hoverKey || undefined;

  const preview: Product = {
    // A custom-style slug so productHref resolves to the existing /product?p=… page: the live
    // preview's card links never point at (and never prefetch) a non-existent static route.
    slug: "c-preview",
    name: values.name || t("editor.preview.untitled"),
    category: (values.category as CategorySlug) ?? "perfumes",
    type: { en: values.typeEn || "", ar: values.typeAr || "" },
    tagline: { en: "", ar: "" },
    description: { en: "", ar: "" },
    howTo: { en: "", ar: "" },
    variants: previewVariants,
    images: { card: cardKey, ...(hoverKey ? { hover: hoverKey } : {}), gallery },
    badge: values.badge ? "new" : undefined,
    related: [],
    aliases: [],
    todo: [],
  };

  return (
    <div>
      <h2 className="caps text-[13px] font-medium text-muted">{t("editor.preview.title")}</h2>
      <div className="mt-3 border border-line p-3">
        <div inert data-testid="editor-preview" className="pointer-events-none">
          <ProductCard product={preview} />
        </div>
      </div>
    </div>
  );
}
