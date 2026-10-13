// Admin-only bridge between the home overrides store and the editor's form state. It may import
// the message JSON directly (like the invoice) to know the ORIGINAL texts in both languages — it
// must NEVER be imported from storefront code, which ships on every page and must stay JSON-free.
//
// A "draft" is the full, prefilled form shape for a section: every field carries what currently
// shows (an override if there is one, else the built-in text / default photo / default link).
// draftToOverrides turns a draft back into the MINIMAL override — only what differs from the
// original — so an emptied field brings back the built-in and nothing redundant is stored.

import type { Catalog } from "@/lib/catalog";
import {
  HOME_DEFAULTS,
  HOME_LIMITS,
  sceneImage,
  type DuoOverrides,
  type FeatureOverrides,
  type FilmOverrides,
  type HeroOverrides,
  type HomeOverrides,
  type HomeSection,
  type HomeText,
  type InstagramOverrides,
  type ProductRowOverrides,
  type ServicesOverrides,
  type StoryOverrides,
} from "@/lib/home";
import type { Locale } from "@/i18n/routing";
import enHome from "../../../messages/en/home.json";
import arHome from "../../../messages/ar/home.json";

// ── Draft shapes ────────────────────────────────────────────────────────────────

/** A bilingual text field in the editor (both languages are always present strings). */
export type DraftText = { en: string; ar: string };

export type HeroDraft = { eyebrow: DraftText; title: DraftText; cta: DraftText; href: string };
export type ProductRowDraft = { title: DraftText; subtitle: DraftText; products: string[] };
export type StoryDraft = { title: DraftText; cta: DraftText; href: string; image: string; mobileImage: string };
export type DuoDraft = { cta: DraftText; items: Array<{ product: string; image: string }> };
export type FeatureDraft = {
  product: string;
  image: string;
  eyebrow: DraftText;
  body: DraftText;
  cta: DraftText;
  signature: string;
  line: string;
};
export type FilmDraft = { eyebrow: DraftText; title: DraftText; body: DraftText; cta: DraftText; href: string };
export type ServicesDraft = {
  items: Array<{ title: DraftText; text: DraftText }>;
  whatsappText: DraftText;
  whatsappCta: DraftText;
  whatsappMessage: DraftText;
};
export type InstagramDraft = { photos: string[]; subtitle: DraftText };
export type TickerDraft = { en: string[]; ar: string[] };

export type HomeDrafts = {
  ticker: TickerDraft;
  hero: HeroDraft;
  trilogy: ProductRowDraft;
  story: StoryDraft;
  duo: DuoDraft;
  feature: FeatureDraft;
  film: FilmDraft;
  homeGrid: ProductRowDraft;
  services: ServicesDraft;
  instagram: InstagramDraft;
};

/** A section in the editor — the override sections plus the top banner (held in settings). */
export type SectionId = "ticker" | HomeSection;

/** The order the cards are shown in. */
export const ORDER: SectionId[] = [
  "ticker",
  "hero",
  "trilogy",
  "story",
  "duo",
  "feature",
  "film",
  "homeGrid",
  "services",
  "instagram",
];

// ── Original texts (both languages) ──────────────────────────────────────────────

const text = (en: string, ar: string): DraftText => ({ en, ar });

/** The built-in texts per editable field, read from the two home.json files. */
export const ORIGINALS = {
  hero: {
    eyebrow: text(enHome.hero.eyebrow, arHome.hero.eyebrow),
    title: text(enHome.hero.title, arHome.hero.title),
    cta: text(enHome.hero.cta, arHome.hero.cta),
  },
  trilogy: {
    title: text(enHome.trilogy.title, arHome.trilogy.title),
    subtitle: text(enHome.trilogy.subtitle, arHome.trilogy.subtitle),
  },
  story: {
    title: text(enHome.story.title, arHome.story.title),
    cta: text(enHome.story.cta, arHome.story.cta),
  },
  duo: {
    cta: text(enHome.duo.cta, arHome.duo.cta),
  },
  feature: {
    eyebrow: text(enHome.aura.eyebrow, arHome.aura.eyebrow),
    body: text(enHome.aura.body, arHome.aura.body),
    cta: text(enHome.aura.cta, arHome.aura.cta),
    signature: enHome.aura.signature, // the Arabic line on the can (same in both languages)
    line: enHome.aura.tagline, // the English sub-line (English site only)
  },
  film: {
    eyebrow: text(enHome.film.eyebrow, arHome.film.eyebrow),
    title: text(enHome.film.title, arHome.film.title),
    body: text(enHome.film.body, arHome.film.body),
    cta: text(enHome.film.cta, arHome.film.cta),
  },
  homeGrid: {
    title: text(enHome.homeGrid.title, arHome.homeGrid.title),
    subtitle: text(enHome.homeGrid.subtitle, arHome.homeGrid.subtitle),
  },
  services: {
    items: [
      { title: text(enHome.services.delivery.title, arHome.services.delivery.title), textVal: text(enHome.services.delivery.text, arHome.services.delivery.text) },
      { title: text(enHome.services.returns.title, arHome.services.returns.title), textVal: text(enHome.services.returns.text, arHome.services.returns.text) },
      { title: text(enHome.services.payment.title, arHome.services.payment.title), textVal: text(enHome.services.payment.text, arHome.services.payment.text) },
    ],
    whatsappText: text(enHome.services.whatsapp.text, arHome.services.whatsapp.text),
    whatsappCta: text(enHome.services.whatsapp.cta, arHome.services.whatsapp.cta),
    whatsappMessage: text(enHome.services.whatsapp.message, arHome.services.whatsapp.message),
  },
  instagram: {
    subtitle: text(enHome.instagram.subtitle, arHome.instagram.subtitle),
  },
} as const;

// ── Draft text helpers ────────────────────────────────────────────────────────────

/** The draft value for a bilingual field: the override else the built-in text. */
const draftText = (override: HomeText | undefined, original: DraftText): DraftText => ({
  en: override?.en ?? original.en,
  ar: override?.ar ?? original.ar,
});

/** The minimal text override: trimmed per language, dropping empties and anything equal to original. */
function textDiff(draft: DraftText, original: DraftText): HomeText | undefined {
  const out: HomeText = {};
  const en = draft.en.trim();
  if (en.length > 0 && en !== original.en) out.en = en;
  const ar = draft.ar.trim();
  if (ar.length > 0 && ar !== original.ar) out.ar = ar;
  return out.en === undefined && out.ar === undefined ? undefined : out;
}

const sameProducts = (a: string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((slug, i) => slug === b[i]);

// ── overrides → drafts ────────────────────────────────────────────────────────────

/** Builds every section's draft, each field prefilled with what currently shows. */
export function toDrafts(overrides: HomeOverrides, ticker: TickerDraft): HomeDrafts {
  const hero = overrides.hero;
  const trilogy = overrides.trilogy;
  const story = overrides.story;
  const duo = overrides.duo;
  const feature = overrides.feature;
  const film = overrides.film;
  const homeGrid = overrides.homeGrid;
  const services = overrides.services;
  const instagram = overrides.instagram;

  return {
    ticker: { en: [...ticker.en], ar: [...ticker.ar] },
    hero: {
      eyebrow: draftText(hero?.eyebrow, ORIGINALS.hero.eyebrow),
      title: draftText(hero?.title, ORIGINALS.hero.title),
      cta: draftText(hero?.cta, ORIGINALS.hero.cta),
      href: hero?.href ?? HOME_DEFAULTS.hero.href,
    },
    trilogy: {
      title: draftText(trilogy?.title, ORIGINALS.trilogy.title),
      subtitle: draftText(trilogy?.subtitle, ORIGINALS.trilogy.subtitle),
      products: trilogy?.products ?? [...HOME_DEFAULTS.trilogy.products],
    },
    story: {
      title: draftText(story?.title, ORIGINALS.story.title),
      cta: draftText(story?.cta, ORIGINALS.story.cta),
      href: story?.href ?? HOME_DEFAULTS.story.href,
      image: story?.image ?? "",
      mobileImage: story?.mobileImage ?? "",
    },
    duo: {
      cta: draftText(duo?.cta, ORIGINALS.duo.cta),
      items: [0, 1].map((i) => ({
        product: duo?.items?.[i]?.product ?? HOME_DEFAULTS.duo.products[i],
        image: duo?.items?.[i]?.image ?? "",
      })),
    },
    feature: {
      product: feature?.product ?? HOME_DEFAULTS.feature.product,
      image: feature?.image ?? "",
      eyebrow: draftText(feature?.eyebrow, ORIGINALS.feature.eyebrow),
      body: draftText(feature?.body, ORIGINALS.feature.body),
      cta: draftText(feature?.cta, ORIGINALS.feature.cta),
      signature: feature?.signature ?? ORIGINALS.feature.signature,
      line: feature?.line ?? ORIGINALS.feature.line,
    },
    film: {
      eyebrow: draftText(film?.eyebrow, ORIGINALS.film.eyebrow),
      title: draftText(film?.title, ORIGINALS.film.title),
      body: draftText(film?.body, ORIGINALS.film.body),
      cta: draftText(film?.cta, ORIGINALS.film.cta),
      href: film?.href ?? HOME_DEFAULTS.film.href,
    },
    homeGrid: {
      title: draftText(homeGrid?.title, ORIGINALS.homeGrid.title),
      subtitle: draftText(homeGrid?.subtitle, ORIGINALS.homeGrid.subtitle),
      products: homeGrid?.products ?? [...HOME_DEFAULTS.homeGrid.products],
    },
    services: {
      items: ORIGINALS.services.items.map((orig, i) => ({
        title: draftText(services?.items?.[i]?.title, orig.title),
        text: draftText(services?.items?.[i]?.text, orig.textVal),
      })),
      whatsappText: draftText(services?.whatsappText, ORIGINALS.services.whatsappText),
      whatsappCta: draftText(services?.whatsappCta, ORIGINALS.services.whatsappCta),
      whatsappMessage: draftText(services?.whatsappMessage, ORIGINALS.services.whatsappMessage),
    },
    instagram: {
      photos: [0, 1, 2, 3, 4, 5].map((i) => instagram?.photos?.[i] ?? ""),
      subtitle: draftText(instagram?.subtitle, ORIGINALS.instagram.subtitle),
    },
  };
}

// ── drafts → minimal override ───────────────────────────────────────────────────────

const compact = <T extends object>(obj: T): T | undefined => (Object.keys(obj).length > 0 ? obj : undefined);

function heroOverride(d: HeroDraft): HeroOverrides | undefined {
  const out: HeroOverrides = {};
  const eyebrow = textDiff(d.eyebrow, ORIGINALS.hero.eyebrow);
  if (eyebrow) out.eyebrow = eyebrow;
  const title = textDiff(d.title, ORIGINALS.hero.title);
  if (title) out.title = title;
  const cta = textDiff(d.cta, ORIGINALS.hero.cta);
  if (cta) out.cta = cta;
  if (d.href && d.href !== HOME_DEFAULTS.hero.href) out.href = d.href;
  return compact(out);
}

function productRowOverride(
  d: ProductRowDraft,
  originals: { title: DraftText; subtitle: DraftText },
  defaults: readonly string[],
): ProductRowOverrides | undefined {
  const out: ProductRowOverrides = {};
  const title = textDiff(d.title, originals.title);
  if (title) out.title = title;
  const subtitle = textDiff(d.subtitle, originals.subtitle);
  if (subtitle) out.subtitle = subtitle;
  if (!sameProducts(d.products, defaults)) out.products = d.products;
  return compact(out);
}

function storyOverride(d: StoryDraft): StoryOverrides | undefined {
  const out: StoryOverrides = {};
  const title = textDiff(d.title, ORIGINALS.story.title);
  if (title) out.title = title;
  const cta = textDiff(d.cta, ORIGINALS.story.cta);
  if (cta) out.cta = cta;
  if (d.href && d.href !== HOME_DEFAULTS.story.href) out.href = d.href;
  // The computer photo is only stored when it differs from the built-in original.
  if (d.image && d.image !== HOME_DEFAULTS.story.image) out.image = d.image;
  // Phones already show the computer photo (or the default phone art) without a mobile photo; only
  // store a mobile photo when it differs from what they'd show anyway.
  const phoneWithoutMobile = out.image || HOME_DEFAULTS.story.mobileImage;
  if (d.mobileImage && d.mobileImage !== phoneWithoutMobile) out.mobileImage = d.mobileImage;
  return compact(out);
}

function duoOverride(d: DuoDraft, catalog: Catalog): DuoOverrides | undefined {
  const out: DuoOverrides = {};
  const cta = textDiff(d.cta, ORIGINALS.duo.cta);
  if (cta) out.cta = cta;
  const items = [0, 1].map((i) => {
    const slot: { product?: string; image?: string } = {};
    if (d.items[i].product && d.items[i].product !== HOME_DEFAULTS.duo.products[i]) slot.product = d.items[i].product;
    // Only store a photo that differs from the product's automatic scene photo (else it would pin
    // the old product's photo when the product is changed later).
    if (d.items[i].image && d.items[i].image !== autoImage(catalog, d.items[i].product)) slot.image = d.items[i].image;
    return slot;
  });
  if (items.some((slot) => slot.product || slot.image)) out.items = items;
  return compact(out);
}

function featureOverride(d: FeatureDraft, catalog: Catalog): FeatureOverrides | undefined {
  const out: FeatureOverrides = {};
  if (d.product && d.product !== HOME_DEFAULTS.feature.product) out.product = d.product;
  // Only store a photo that differs from the product's automatic scene photo.
  if (d.image && d.image !== autoImage(catalog, d.product)) out.image = d.image;
  const eyebrow = textDiff(d.eyebrow, ORIGINALS.feature.eyebrow);
  if (eyebrow) out.eyebrow = eyebrow;
  const body = textDiff(d.body, ORIGINALS.feature.body);
  if (body) out.body = body;
  const cta = textDiff(d.cta, ORIGINALS.feature.cta);
  if (cta) out.cta = cta;
  const signature = d.signature.trim();
  if (signature && signature !== ORIGINALS.feature.signature) out.signature = signature;
  const line = d.line.trim();
  if (line && line !== ORIGINALS.feature.line) out.line = line;
  return compact(out);
}

function filmOverride(d: FilmDraft): FilmOverrides | undefined {
  const out: FilmOverrides = {};
  const eyebrow = textDiff(d.eyebrow, ORIGINALS.film.eyebrow);
  if (eyebrow) out.eyebrow = eyebrow;
  const title = textDiff(d.title, ORIGINALS.film.title);
  if (title) out.title = title;
  const body = textDiff(d.body, ORIGINALS.film.body);
  if (body) out.body = body;
  const cta = textDiff(d.cta, ORIGINALS.film.cta);
  if (cta) out.cta = cta;
  if (d.href && d.href !== HOME_DEFAULTS.film.href) out.href = d.href;
  return compact(out);
}

function servicesOverride(d: ServicesDraft): ServicesOverrides | undefined {
  const out: ServicesOverrides = {};
  const items = ORIGINALS.services.items.map((orig, i) => {
    const slot: { title?: HomeText; text?: HomeText } = {};
    const title = textDiff(d.items[i].title, orig.title);
    if (title) slot.title = title;
    const txt = textDiff(d.items[i].text, orig.textVal);
    if (txt) slot.text = txt;
    return slot;
  });
  if (items.some((slot) => slot.title || slot.text)) out.items = items;
  const whatsappText = textDiff(d.whatsappText, ORIGINALS.services.whatsappText);
  if (whatsappText) out.whatsappText = whatsappText;
  const whatsappCta = textDiff(d.whatsappCta, ORIGINALS.services.whatsappCta);
  if (whatsappCta) out.whatsappCta = whatsappCta;
  const whatsappMessage = textDiff(d.whatsappMessage, ORIGINALS.services.whatsappMessage);
  if (whatsappMessage) out.whatsappMessage = whatsappMessage;
  return compact(out);
}

function instagramOverride(d: InstagramDraft): InstagramOverrides | undefined {
  const out: InstagramOverrides = {};
  // A photo equal to the built-in tile is stored as "" (keep the original).
  const photos = d.photos.map((photo, i) => (photo && photo !== HOME_DEFAULTS.instagram.photos[i] ? photo : ""));
  if (photos.some((photo) => photo !== "")) out.photos = photos;
  const subtitle = textDiff(d.subtitle, ORIGINALS.instagram.subtitle);
  if (subtitle) out.subtitle = subtitle;
  return compact(out);
}

/** The minimal override for one section, or undefined when nothing differs from the built-ins. */
export function draftToOverrides(
  id: HomeSection,
  draft: HomeDrafts[HomeSection],
  catalog: Catalog,
): HomeOverrides[HomeSection] {
  switch (id) {
    case "hero":
      return heroOverride(draft as HeroDraft);
    case "trilogy":
      return productRowOverride(draft as ProductRowDraft, ORIGINALS.trilogy, HOME_DEFAULTS.trilogy.products);
    case "homeGrid":
      return productRowOverride(draft as ProductRowDraft, ORIGINALS.homeGrid, HOME_DEFAULTS.homeGrid.products);
    case "story":
      return storyOverride(draft as StoryDraft);
    case "duo":
      return duoOverride(draft as DuoDraft, catalog);
    case "feature":
      return featureOverride(draft as FeatureDraft, catalog);
    case "film":
      return filmOverride(draft as FilmDraft);
    case "services":
      return servicesOverride(draft as ServicesDraft);
    case "instagram":
      return instagramOverride(draft as InstagramDraft);
  }
}

// ── Validation ──────────────────────────────────────────────────────────────────

/** The text fields of a section paired with their limits, for the length check. */
function textPairs(id: SectionId, draft: HomeDrafts[SectionId]): Array<{ value: DraftText; limit: number }> {
  switch (id) {
    case "hero": {
      const d = draft as HeroDraft;
      return [
        { value: d.eyebrow, limit: HOME_LIMITS.eyebrow },
        { value: d.title, limit: HOME_LIMITS.heroTitle },
        { value: d.cta, limit: HOME_LIMITS.button },
      ];
    }
    case "trilogy":
    case "homeGrid": {
      const d = draft as ProductRowDraft;
      return [
        { value: d.title, limit: HOME_LIMITS.sectionTitle },
        { value: d.subtitle, limit: HOME_LIMITS.subtitle },
      ];
    }
    case "story": {
      const d = draft as StoryDraft;
      return [
        { value: d.title, limit: HOME_LIMITS.sectionTitle },
        { value: d.cta, limit: HOME_LIMITS.button },
      ];
    }
    case "duo": {
      const d = draft as DuoDraft;
      return [{ value: d.cta, limit: HOME_LIMITS.button }];
    }
    case "feature": {
      const d = draft as FeatureDraft;
      return [
        { value: d.eyebrow, limit: HOME_LIMITS.eyebrow },
        { value: d.body, limit: HOME_LIMITS.featureBody },
        { value: d.cta, limit: HOME_LIMITS.button },
      ];
    }
    case "film": {
      const d = draft as FilmDraft;
      return [
        { value: d.eyebrow, limit: HOME_LIMITS.eyebrow },
        { value: d.title, limit: HOME_LIMITS.sectionTitle },
        { value: d.body, limit: HOME_LIMITS.filmBody },
        { value: d.cta, limit: HOME_LIMITS.button },
      ];
    }
    case "services": {
      const d = draft as ServicesDraft;
      return [
        ...d.items.flatMap((item) => [
          { value: item.title, limit: HOME_LIMITS.serviceTitle },
          { value: item.text, limit: HOME_LIMITS.serviceText },
        ]),
        { value: d.whatsappText, limit: HOME_LIMITS.whatsappText },
        { value: d.whatsappCta, limit: HOME_LIMITS.button },
        { value: d.whatsappMessage, limit: HOME_LIMITS.whatsappMessage },
      ];
    }
    case "instagram": {
      const d = draft as InstagramDraft;
      return [{ value: d.subtitle, limit: HOME_LIMITS.subtitle }];
    }
    default:
      return [];
  }
}

/**
 * Validation error keys (under `homePage.errors`), empty when the draft is fine: each product row
 * needs at least one product, the two duo products must differ, and no text may exceed its limit
 * (the inputs also cap length, so this is a safety net).
 */
export function validateDraft(id: SectionId, draft: HomeDrafts[SectionId]): string[] {
  const errors: string[] = [];

  if (id === "trilogy" || id === "homeGrid") {
    if ((draft as ProductRowDraft).products.length < 1) errors.push("productsRequired");
  }
  if (id === "duo") {
    const items = (draft as DuoDraft).items;
    if (items[0].product && items[0].product === items[1].product) errors.push("duoSame");
  }
  const tooLong = textPairs(id, draft).some(
    ({ value, limit }) => value.en.trim().length > limit || value.ar.trim().length > limit,
  );
  if (tooLong) errors.push("tooLong");

  return errors;
}

// ── Card summaries ──────────────────────────────────────────────────────────────

const productLabel = (catalog: Catalog, slug: string): string => catalog.bySlug.get(slug)?.name ?? slug;

/** A short one-line summary for the card header (the representative content of the section). */
export function summary(id: SectionId, draft: HomeDrafts[SectionId], catalog: Catalog, locale: Locale): string {
  switch (id) {
    case "ticker": {
      const d = draft as TickerDraft;
      return d[locale].filter((m) => m.trim().length > 0).join(" · ");
    }
    case "hero":
      return (draft as HeroDraft).title[locale];
    case "trilogy":
    case "homeGrid":
      return (draft as ProductRowDraft).products.map((slug) => productLabel(catalog, slug)).join(" · ");
    case "story":
      return (draft as StoryDraft).title[locale];
    case "duo":
      return (draft as DuoDraft).items.map((item) => productLabel(catalog, item.product)).join(" · ");
    case "feature":
      return productLabel(catalog, (draft as FeatureDraft).product);
    case "film":
      return (draft as FilmDraft).title[locale];
    case "services":
      return (draft as ServicesDraft).items.map((item) => item.title[locale]).join(" · ");
    case "instagram":
      return (draft as InstagramDraft).subtitle[locale];
    default:
      return "";
  }
}

/** The scene (automatic) photo for a product, or "" when the product is missing. */
export function autoImage(catalog: Catalog, slug: string): string {
  const product = catalog.bySlug.get(slug);
  return product ? sceneImage(product) : "";
}
