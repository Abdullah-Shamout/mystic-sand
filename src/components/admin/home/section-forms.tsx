"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatDays, standardWhen } from "@/components/content/values";
import { delivery } from "@/data/site";
import type { Locale } from "@/i18n/routing";
import {
  autoImage,
  ORIGINALS,
  type DuoDraft,
  type FeatureDraft,
  type FilmDraft,
  type HeroDraft,
  type InstagramDraft,
  type ProductRowDraft,
  type ServicesDraft,
  type StoryDraft,
} from "@/lib/admin/home-drafts";
import type { Catalog } from "@/lib/catalog";
import { fillTokens, HOME_DEFAULTS, HOME_LIMITS, SERVICE_KEYS } from "@/lib/home";
import { useLiveSettings } from "@/lib/live";
import { isolatedKWD } from "@/lib/money";
import { feeFor } from "@/lib/settings";
import { BilingualText, ImageField, LinkSelect, PlainText, ProductListField, ProductSelect } from "./fields";

/** Plain-language note under a form. */
function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] leading-relaxed text-muted">{children}</p>;
}

const STORY_UPLOAD = { maxSide: 1600, maxChars: 450_000 };

// ── Hero ──────────────────────────────────────────────────────────────────────────

export function HeroForm({
  draft,
  onChange,
  catalog,
  locale,
}: {
  draft: HeroDraft;
  onChange: (patch: Partial<HeroDraft>) => void;
  catalog: Catalog;
  locale: Locale;
}) {
  const t = useTranslations("admin");
  return (
    <div className="space-y-5">
      <BilingualText section="hero" field="eyebrow" label={t("homePage.fields.eyebrow")} value={draft.eyebrow} original={ORIGINALS.hero.eyebrow} limit={HOME_LIMITS.eyebrow} onChange={(v) => onChange({ eyebrow: v })} />
      <BilingualText section="hero" field="title" label={t("homePage.fields.heroTitle")} value={draft.title} original={ORIGINALS.hero.title} limit={HOME_LIMITS.heroTitle} onChange={(v) => onChange({ title: v })} />
      <BilingualText section="hero" field="cta" label={t("homePage.fields.button")} value={draft.cta} original={ORIGINALS.hero.cta} limit={HOME_LIMITS.button} onChange={(v) => onChange({ cta: v })} />
      <LinkSelect section="hero" label={t("homePage.fields.link")} value={draft.href} catalog={catalog} locale={locale} onChange={(href) => onChange({ href })} />
    </div>
  );
}

// ── Product rows (trilogy / for the home) ─────────────────────────────────────────────

export function ProductRowForm({
  section,
  draft,
  onChange,
  catalog,
  locale,
}: {
  section: "trilogy" | "homeGrid";
  draft: ProductRowDraft;
  onChange: (patch: Partial<ProductRowDraft>) => void;
  catalog: Catalog;
  locale: Locale;
}) {
  const t = useTranslations("admin");
  const originals = section === "trilogy" ? ORIGINALS.trilogy : ORIGINALS.homeGrid;
  const hint = section === "trilogy" ? t("homePage.products.hint36") : t("homePage.products.hint48");
  return (
    <div className="space-y-5">
      <BilingualText section={section} field="title" label={t("homePage.fields.sectionTitle")} value={draft.title} original={originals.title} limit={HOME_LIMITS.sectionTitle} onChange={(v) => onChange({ title: v })} />
      <BilingualText section={section} field="subtitle" label={t("homePage.fields.subtitle")} value={draft.subtitle} original={originals.subtitle} limit={HOME_LIMITS.subtitle} onChange={(v) => onChange({ subtitle: v })} />
      <div>
        <p className="mb-1.5 text-[14px] text-ink">{t("homePage.fields.products")}</p>
        <ProductListField section={section} value={draft.products} catalog={catalog} locale={locale} hint={hint} onChange={(products) => onChange({ products })} />
      </div>
    </div>
  );
}

// ── Story panel ──────────────────────────────────────────────────────────────────

export function StoryForm({
  draft,
  onChange,
  catalog,
  locale,
}: {
  draft: StoryDraft;
  onChange: (patch: Partial<StoryDraft>) => void;
  catalog: Catalog;
  locale: Locale;
}) {
  const t = useTranslations("admin");
  return (
    <div className="space-y-5">
      <ImageField
        section="story"
        slot="image"
        label={t("homePage.fields.storyImage")}
        value={draft.image}
        fallback={HOME_DEFAULTS.story.image}
        mode="original"
        kind="photo"
        thumbClass="aspect-[4/3]"
        shapeHint={t("homePage.photo.shapeWide")}
        uploadOpts={STORY_UPLOAD}
        onChange={(image) => onChange({ image })}
      />
      <ImageField
        section="story"
        slot="mobileImage"
        label={t("homePage.fields.storyMobile")}
        value={draft.mobileImage}
        fallback={draft.image || HOME_DEFAULTS.story.mobileImage}
        mode="original"
        emptyLabel={draft.image ? t("homePage.photo.sameAsComputer") : undefined}
        kind="photo"
        thumbClass="aspect-[3/4]"
        shapeHint={t("homePage.photo.shapeTall")}
        uploadOpts={STORY_UPLOAD}
        onChange={(mobileImage) => onChange({ mobileImage })}
      />
      <BilingualText section="story" field="title" label={t("homePage.fields.sectionTitle")} value={draft.title} original={ORIGINALS.story.title} limit={HOME_LIMITS.sectionTitle} onChange={(v) => onChange({ title: v })} />
      <BilingualText section="story" field="cta" label={t("homePage.fields.button")} value={draft.cta} original={ORIGINALS.story.cta} limit={HOME_LIMITS.button} onChange={(v) => onChange({ cta: v })} />
      <LinkSelect section="story" label={t("homePage.fields.link")} value={draft.href} catalog={catalog} locale={locale} onChange={(href) => onChange({ href })} />
    </div>
  );
}

// ── Two products ──────────────────────────────────────────────────────────────────

export function DuoForm({
  draft,
  onChange,
  catalog,
  locale,
}: {
  draft: DuoDraft;
  onChange: (patch: Partial<DuoDraft>) => void;
  catalog: Catalog;
  locale: Locale;
}) {
  const t = useTranslations("admin");
  const setItem = (i: number, patch: { product?: string; image?: string }) => {
    const items = draft.items.map((item, idx) => (idx === i ? { ...item, ...patch } : item));
    onChange({ items });
  };
  const slotLabels = [t("homePage.duo.slot1"), t("homePage.duo.slot2")];

  return (
    <div className="space-y-6">
      {draft.items.map((item, i) => (
        <div key={i} className="space-y-4 border border-line bg-tile/40 p-4">
          <p className="caps text-[12px] font-medium text-muted">{slotLabels[i]}</p>
          <ProductSelect section={`duo-${i}`} label={t("homePage.fields.product")} value={item.product} catalog={catalog} locale={locale} onChange={(product) => setItem(i, { product })} />
          <ImageField
            section="duo"
            slot={`${i}-image`}
            label={t("homePage.fields.photo")}
            value={item.image}
            fallback={autoImage(catalog, item.product)}
            mode="automatic"
            kind="photo"
            thumbClass="aspect-[4/5]"
            shapeHint={t("homePage.photo.shapeTall")}
            onChange={(image) => setItem(i, { image })}
          />
        </div>
      ))}
      <BilingualText section="duo" field="cta" label={t("homePage.fields.button")} value={draft.cta} original={ORIGINALS.duo.cta} limit={HOME_LIMITS.button} onChange={(v) => onChange({ cta: v })} />
      <Note>{t("homePage.duo.note")}</Note>
    </div>
  );
}

// ── Featured product ─────────────────────────────────────────────────────────────

export function FeatureForm({
  draft,
  onChange,
  catalog,
  locale,
}: {
  draft: FeatureDraft;
  onChange: (patch: Partial<FeatureDraft>) => void;
  catalog: Catalog;
  locale: Locale;
}) {
  const t = useTranslations("admin");
  const product = catalog.bySlug.get(draft.product);
  const name = product?.name ?? draft.product;
  const notAura = draft.product !== HOME_DEFAULTS.feature.product;
  const unavailable = !product || product.hidden;

  return (
    <div className="space-y-5">
      <ProductSelect section="feature" label={t("homePage.fields.product")} value={draft.product} catalog={catalog} locale={locale} onChange={(p) => onChange({ product: p })} />
      {unavailable && <p className="text-[13px] text-danger">{t("homePage.feature.hidden")}</p>}
      {notAura && <p className="border-s-2 border-racing bg-tile/50 py-2 ps-3 text-[13px] text-ink">{t("homePage.feature.auraCallout", { name })}</p>}
      <ImageField
        section="feature"
        slot="image"
        label={t("homePage.fields.photo")}
        value={draft.image}
        fallback={autoImage(catalog, draft.product)}
        mode="automatic"
        kind="photo"
        thumbClass="aspect-[4/5]"
        shapeHint={t("homePage.photo.shapeTall")}
        onChange={(image) => onChange({ image })}
      />
      <BilingualText section="feature" field="eyebrow" label={t("homePage.fields.eyebrow")} value={draft.eyebrow} original={ORIGINALS.feature.eyebrow} limit={HOME_LIMITS.eyebrow} onChange={(v) => onChange({ eyebrow: v })} />
      <PlainText section="feature" field="signature" label={t("homePage.feature.signatureLabel")} value={draft.signature} original={ORIGINALS.feature.signature} limit={HOME_LIMITS.signature} dir="rtl" lang="ar" onChange={(signature) => onChange({ signature })} />
      <PlainText section="feature" field="line" label={t("homePage.feature.lineLabel")} value={draft.line} original={ORIGINALS.feature.line} limit={HOME_LIMITS.line} onChange={(line) => onChange({ line })} />
      <BilingualText section="feature" field="body" label={t("homePage.fields.body")} value={draft.body} original={ORIGINALS.feature.body} limit={HOME_LIMITS.featureBody} textarea onChange={(v) => onChange({ body: v })} />
      <BilingualText section="feature" field="cta" label={t("homePage.fields.button")} value={draft.cta} original={ORIGINALS.feature.cta} limit={HOME_LIMITS.button} onChange={(v) => onChange({ cta: v })} />
    </div>
  );
}

// ── Brand film ──────────────────────────────────────────────────────────────────

export function FilmForm({
  draft,
  onChange,
  catalog,
  locale,
}: {
  draft: FilmDraft;
  onChange: (patch: Partial<FilmDraft>) => void;
  catalog: Catalog;
  locale: Locale;
}) {
  const t = useTranslations("admin");
  return (
    <div className="space-y-5">
      <BilingualText section="film" field="eyebrow" label={t("homePage.fields.eyebrow")} value={draft.eyebrow} original={ORIGINALS.film.eyebrow} limit={HOME_LIMITS.eyebrow} onChange={(v) => onChange({ eyebrow: v })} />
      <BilingualText section="film" field="title" label={t("homePage.fields.sectionTitle")} value={draft.title} original={ORIGINALS.film.title} limit={HOME_LIMITS.sectionTitle} onChange={(v) => onChange({ title: v })} />
      <BilingualText section="film" field="body" label={t("homePage.fields.body")} value={draft.body} original={ORIGINALS.film.body} limit={HOME_LIMITS.filmBody} textarea onChange={(v) => onChange({ body: v })} />
      <BilingualText section="film" field="cta" label={t("homePage.fields.button")} value={draft.cta} original={ORIGINALS.film.cta} limit={HOME_LIMITS.button} onChange={(v) => onChange({ cta: v })} />
      <LinkSelect section="film" label={t("homePage.fields.link")} value={draft.href} catalog={catalog} locale={locale} onChange={(href) => onChange({ href })} />
    </div>
  );
}

// ── Services ──────────────────────────────────────────────────────────────────────

export function ServicesForm({
  draft,
  onChange,
}: {
  draft: ServicesDraft;
  onChange: (patch: Partial<ServicesDraft>) => void;
}) {
  const t = useTranslations("admin");
  const locale = useLocale() as Locale;
  const settings = useLiveSettings();
  const values = {
    fee: isolatedKWD(feeFor(settings), locale),
    when: standardWhen(locale),
    window: formatDays(delivery.returnsDays, locale),
  };

  const setItem = (i: number, patch: { title?: typeof draft.items[number]["title"]; text?: typeof draft.items[number]["text"] }) => {
    const items = draft.items.map((item, idx) => (idx === i ? { ...item, ...patch } : item));
    onChange({ items });
  };

  return (
    <div className="space-y-6">
      {SERVICE_KEYS.map((key, i) => {
        const orig = ORIGINALS.services.items[i];
        return (
          <div key={key} className="space-y-3 border border-line bg-tile/40 p-4">
            <p className="caps text-[12px] font-medium text-muted">{t(`homePage.services.block.${key}`)}</p>
            <BilingualText section={`services-${key}`} field="title" label={t("homePage.fields.serviceTitle")} value={draft.items[i].title} original={orig.title} limit={HOME_LIMITS.serviceTitle} onChange={(v) => setItem(i, { title: v })} />
            <BilingualText section={`services-${key}`} field="text" label={t("homePage.fields.serviceText")} value={draft.items[i].text} original={orig.textVal} limit={HOME_LIMITS.serviceText} textarea onChange={(v) => setItem(i, { text: v })} />
            <p className="text-[12px] leading-relaxed text-muted">{t("homePage.services.tokenHint")}</p>
            <p className="text-[12px] leading-relaxed text-ink">
              <span className="caps text-muted">{t("homePage.services.showsAs")}</span>{" "}
              <bdi>{fillTokens(draft.items[i].text[locale], values)}</bdi>
            </p>
          </div>
        );
      })}
      <div className="space-y-4 border border-line bg-tile/40 p-4">
        <p className="caps text-[12px] font-medium text-muted">{t("homePage.services.whatsappTitle")}</p>
        <BilingualText section="services" field="whatsappText" label={t("homePage.fields.whatsappText")} value={draft.whatsappText} original={ORIGINALS.services.whatsappText} limit={HOME_LIMITS.whatsappText} onChange={(v) => onChange({ whatsappText: v })} />
        <BilingualText section="services" field="whatsappCta" label={t("homePage.fields.button")} value={draft.whatsappCta} original={ORIGINALS.services.whatsappCta} limit={HOME_LIMITS.button} onChange={(v) => onChange({ whatsappCta: v })} />
        <BilingualText section="services" field="whatsappMessage" label={t("homePage.fields.whatsappMessage")} value={draft.whatsappMessage} original={ORIGINALS.services.whatsappMessage} limit={HOME_LIMITS.whatsappMessage} textarea onChange={(v) => onChange({ whatsappMessage: v })} />
      </div>
    </div>
  );
}

// ── Instagram ──────────────────────────────────────────────────────────────────────

export function InstagramForm({
  draft,
  onChange,
}: {
  draft: InstagramDraft;
  onChange: (patch: Partial<InstagramDraft>) => void;
}) {
  const t = useTranslations("admin");
  const setPhoto = (i: number, key: string) => {
    const photos = draft.photos.map((p, idx) => (idx === i ? key : p));
    onChange({ photos });
  };
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {draft.photos.map((photo, i) => (
          <ImageField
            key={i}
            section="instagram"
            slot={`photo-${i}`}
            label={t("homePage.instagram.photoLabel", { n: i + 1 })}
            value={photo}
            fallback={HOME_DEFAULTS.instagram.photos[i]}
            mode="original"
            kind="photo"
            thumbClass="aspect-square"
            shapeHint={t("homePage.photo.shapeSquare")}
            onChange={(key) => setPhoto(i, key)}
          />
        ))}
      </div>
      <BilingualText section="instagram" field="subtitle" label={t("homePage.fields.subtitle")} value={draft.subtitle} original={ORIGINALS.instagram.subtitle} limit={HOME_LIMITS.subtitle} onChange={(v) => onChange({ subtitle: v })} />
    </div>
  );
}
