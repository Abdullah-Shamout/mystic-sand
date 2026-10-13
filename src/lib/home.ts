import media from "@/data/media.generated.json";
import type { Localized, Product } from "@/data/types";
import type { Locale } from "@/i18n/routing";
import { CATEGORY_SLUGS, productHref, type Catalog } from "@/lib/catalog";

// Pure home-page override layer (no React, no zustand, and NEVER the message JSON — it ships on
// every store page). It turns a set of admin edits into safe, sanitised overrides; the storefront
// reads an override after mount and falls back to the built-in message/photo/link when it is absent
// or invalid, so a broken edit can never take the home page down.

/** A text override: a language may be missing, in which case the built-in message shows. */
export type HomeText = Partial<Localized>;

export type HeroOverrides = { eyebrow?: HomeText; title?: HomeText; cta?: HomeText; href?: string };
/** Shared by the trilogy band and the "For the home" band. */
export type ProductRowOverrides = { title?: HomeText; subtitle?: HomeText; products?: string[] };
export type StoryOverrides = { title?: HomeText; cta?: HomeText; href?: string; image?: string; mobileImage?: string };
/** Two slots (positions kept); each is a product and an optional photo. */
export type DuoOverrides = { cta?: HomeText; items?: Array<{ product?: string; image?: string }> };
export type FeatureOverrides = {
  product?: string;
  image?: string;
  eyebrow?: HomeText;
  body?: HomeText;
  cta?: HomeText;
  /** The Arabic line on the can (both languages). */
  signature?: string;
  /** The English sub-line (English site only). */
  line?: string;
};
export type FilmOverrides = { eyebrow?: HomeText; title?: HomeText; body?: HomeText; cta?: HomeText; href?: string };
/** Three slots (delivery, returns, payment) plus the WhatsApp concierge texts. */
export type ServicesOverrides = {
  items?: Array<{ title?: HomeText; text?: HomeText }>;
  whatsappText?: HomeText;
  whatsappCta?: HomeText;
  whatsappMessage?: HomeText;
};
/** Six photo slots ("" = keep the original) plus the caption. */
export type InstagramOverrides = { photos?: string[]; subtitle?: HomeText };

export type HomeOverrides = {
  hero?: HeroOverrides;
  trilogy?: ProductRowOverrides;
  story?: StoryOverrides;
  duo?: DuoOverrides;
  feature?: FeatureOverrides;
  film?: FilmOverrides;
  homeGrid?: ProductRowOverrides;
  services?: ServicesOverrides;
  instagram?: InstagramOverrides;
};

export type HomeSection = keyof HomeOverrides;

export const EMPTY_HOME: HomeOverrides = {};

/** The three reassurance slots, in order. */
export const SERVICE_KEYS = ["delivery", "returns", "payment"] as const;

/** The non-text defaults. Texts stay in messages/{en,ar}/home.json. */
export const HOME_DEFAULTS = {
  hero: { href: "/shop/perfumes" },
  trilogy: { products: ["i", "ii", "iii"] },
  story: { href: "/shop/perfumes", image: "lifestyle/hourglass-candles", mobileImage: "lifestyle/candles-duo" },
  duo: { products: ["cafe", "oud"] },
  feature: { product: "aura" },
  film: { href: "/shop" },
  homeGrid: { products: ["oasis", "mist", "dune", "oud-chips"] },
  instagram: {
    photos: ["renders/aura", "lifestyle/candles-duo", "renders/mist", "lifestyle/roses-iii", "lifestyle/trio-basket", "lifestyle/hourglass-candles"],
  },
};

/** Maximum characters per editable field (texts are stored trimmed, 1..limit per language). */
export const HOME_LIMITS = {
  eyebrow: 40,
  heroTitle: 80,
  sectionTitle: 60,
  subtitle: 160,
  button: 30,
  featureBody: 300,
  filmBody: 400,
  signature: 60,
  line: 80,
  serviceTitle: 60,
  serviceText: 160,
  whatsappText: 120,
  whatsappMessage: 300,
  products: 8,
} as const;

// --- link + image validation ---------------------------------------------------------

/** Non-collection, non-product pages a home link may point at. */
export const PAGE_LINKS = ["/contact", "/faq", "/delivery", "/refund-policy", "/privacy", "/terms", "/orders"] as const;

/** Product slug shape, mirroring the catalog's own slugs (custom products begin "c-"). */
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const UPLOAD_KEY = /^u:[A-Za-z0-9_-]{1,64}$/;

const mediaKeys = new Set(Object.keys(media as Record<string, unknown>));

/** A manifest image key or a (format-valid) upload key. Upload presence is checked at render. */
export const isHomeImageKey = (value: unknown): value is string =>
  typeof value === "string" && (mediaKeys.has(value) || UPLOAD_KEY.test(value));

/** A link the home page may use: a collection, a product page, a fixed page — nothing else. */
export function isHomeHref(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value === "/shop") return true;
  if ((CATEGORY_SLUGS as readonly string[]).some((slug) => value === `/shop/${slug}`)) return true;
  if ((PAGE_LINKS as readonly string[]).includes(value)) return true;
  const base = value.match(/^\/product\/([^/?#]+)$/);
  if (base) return SLUG.test(base[1]) && !base[1].startsWith("c-");
  const custom = value.match(/^\/product\?p=([^&#]+)$/);
  if (custom) return SLUG.test(custom[1]) && custom[1].startsWith("c-");
  return false;
}

/** The product slug a link points at, or undefined for a non-product link. */
export function productSlugFromHref(href: string): string | undefined {
  const base = href.match(/^\/product\/([^/?#]+)$/);
  if (base && SLUG.test(base[1]) && !base[1].startsWith("c-")) return base[1];
  const custom = href.match(/^\/product\?p=([^&#]+)$/);
  if (custom && SLUG.test(custom[1]) && custom[1].startsWith("c-")) return custom[1];
  return undefined;
}

/**
 * Resolves a stored link against the live catalog: a product link survives only while that product
 * exists, is visible and still owns that exact href; any other valid link passes; undefined (and a
 * dead product link) falls back to the section default.
 */
export function liveHref(href: string | undefined, catalog: Catalog, fallback: string): string {
  if (href === undefined) return fallback;
  const slug = productSlugFromHref(href);
  if (slug !== undefined) {
    const product = catalog.bySlug.get(slug);
    if (product && !product.hidden && productHref(slug) === href) return href;
    return fallback;
  }
  return isHomeHref(href) ? href : fallback;
}

// --- text + token helpers ------------------------------------------------------------

/** An override text for the locale, or the built-in fallback. */
export function textOr(text: HomeText | undefined, locale: Locale, fallback: string): string {
  return text?.[locale] ?? fallback;
}

/**
 * Plain replacement of the three service tokens. Admin text never goes through ICU `t()`, where a
 * stray brace or apostrophe would throw; every other brace is left exactly as typed.
 */
export function fillTokens(text: string, values: { fee: string; when: string; window: string }): string {
  return text.replace(/\{(fee|when|window)\}/g, (_, token: "fee" | "when" | "window") => values[token]);
}

/** The home scene render for a product, else its hover/card photo — exactly today's CAFÉ/OUD/AURA art. */
export function sceneImage(product: Product): string {
  const render = `renders/${product.slug}`;
  return mediaKeys.has(render) ? render : (product.images.hover ?? product.images.card);
}

// --- sanitiser -----------------------------------------------------------------------

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

// A lone/unpaired UTF-16 surrogate: an unpaired high surrogate, or a low surrogate with no high
// before it. Such a string throws "URI malformed" in encodeURIComponent (e.g. the WhatsApp link),
// so a stored value that isn't well-formed is dropped (the built-in text then shows).
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const isWellFormed = (value: string): boolean =>
  typeof (value as { isWellFormed?: () => boolean }).isWellFormed === "function"
    ? (value as unknown as { isWellFormed: () => boolean }).isWellFormed()
    : !LONE_SURROGATE.test(value);

/** Keeps each language that is a non-empty, within-limit, well-formed string; else drops it. */
function cleanText(raw: unknown, limit: number): HomeText | undefined {
  if (!isObject(raw)) return undefined;
  const out: HomeText = {};
  for (const lang of ["en", "ar"] as const) {
    const value = raw[lang];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length >= 1 && trimmed.length <= limit && isWellFormed(trimmed)) out[lang] = trimmed;
  }
  return out.en === undefined && out.ar === undefined ? undefined : out;
}

/** A single trimmed, within-limit, well-formed string (signature / line), else undefined. */
function cleanPlain(raw: unknown, limit: number): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length >= 1 && trimmed.length <= limit && isWellFormed(trimmed) ? trimmed : undefined;
}

const cleanSlug = (raw: unknown): string | undefined => (typeof raw === "string" && SLUG.test(raw) ? raw : undefined);
const cleanImage = (raw: unknown): string | undefined => (isHomeImageKey(raw) ? raw : undefined);
const cleanHref = (raw: unknown): string | undefined => (isHomeHref(raw) ? raw : undefined);

/** Valid, unique product slugs, first 8; an empty list is dropped. */
function cleanProducts(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  for (const slug of raw) if (typeof slug === "string" && SLUG.test(slug)) seen.add(slug);
  const list = [...seen].slice(0, HOME_LIMITS.products);
  return list.length > 0 ? list : undefined;
}

/** Drops a section object when it ended up with no surviving fields. */
const compact = <T extends object>(obj: T): T | undefined => (Object.keys(obj).length > 0 ? obj : undefined);

function cleanHero(raw: unknown): HeroOverrides | undefined {
  if (!isObject(raw)) return undefined;
  const out: HeroOverrides = {};
  const eyebrow = cleanText(raw.eyebrow, HOME_LIMITS.eyebrow);
  if (eyebrow) out.eyebrow = eyebrow;
  const title = cleanText(raw.title, HOME_LIMITS.heroTitle);
  if (title) out.title = title;
  const cta = cleanText(raw.cta, HOME_LIMITS.button);
  if (cta) out.cta = cta;
  const href = cleanHref(raw.href);
  if (href) out.href = href;
  return compact(out);
}

function cleanProductRow(raw: unknown): ProductRowOverrides | undefined {
  if (!isObject(raw)) return undefined;
  const out: ProductRowOverrides = {};
  const title = cleanText(raw.title, HOME_LIMITS.sectionTitle);
  if (title) out.title = title;
  const subtitle = cleanText(raw.subtitle, HOME_LIMITS.subtitle);
  if (subtitle) out.subtitle = subtitle;
  const products = cleanProducts(raw.products);
  if (products) out.products = products;
  return compact(out);
}

function cleanStory(raw: unknown): StoryOverrides | undefined {
  if (!isObject(raw)) return undefined;
  const out: StoryOverrides = {};
  const title = cleanText(raw.title, HOME_LIMITS.sectionTitle);
  if (title) out.title = title;
  const cta = cleanText(raw.cta, HOME_LIMITS.button);
  if (cta) out.cta = cta;
  const href = cleanHref(raw.href);
  if (href) out.href = href;
  const image = cleanImage(raw.image);
  if (image) out.image = image;
  const mobileImage = cleanImage(raw.mobileImage);
  if (mobileImage) out.mobileImage = mobileImage;
  return compact(out);
}

function cleanDuo(raw: unknown): DuoOverrides | undefined {
  if (!isObject(raw)) return undefined;
  const out: DuoOverrides = {};
  const cta = cleanText(raw.cta, HOME_LIMITS.button);
  if (cta) out.cta = cta;
  if (Array.isArray(raw.items)) {
    const items = raw.items.slice(0, 2).map((item) => {
      const slot: { product?: string; image?: string } = {};
      if (isObject(item)) {
        const product = cleanSlug(item.product);
        if (product) slot.product = product;
        const image = cleanImage(item.image);
        if (image) slot.image = image;
      }
      return slot;
    });
    // Keep the slot positions, but only store items once at least one slot carries an edit.
    if (items.some((slot) => slot.product || slot.image)) out.items = items;
  }
  return compact(out);
}

function cleanFeature(raw: unknown): FeatureOverrides | undefined {
  if (!isObject(raw)) return undefined;
  const out: FeatureOverrides = {};
  const product = cleanSlug(raw.product);
  if (product) out.product = product;
  const image = cleanImage(raw.image);
  if (image) out.image = image;
  const eyebrow = cleanText(raw.eyebrow, HOME_LIMITS.eyebrow);
  if (eyebrow) out.eyebrow = eyebrow;
  const body = cleanText(raw.body, HOME_LIMITS.featureBody);
  if (body) out.body = body;
  const cta = cleanText(raw.cta, HOME_LIMITS.button);
  if (cta) out.cta = cta;
  const signature = cleanPlain(raw.signature, HOME_LIMITS.signature);
  if (signature) out.signature = signature;
  const line = cleanPlain(raw.line, HOME_LIMITS.line);
  if (line) out.line = line;
  return compact(out);
}

function cleanFilm(raw: unknown): FilmOverrides | undefined {
  if (!isObject(raw)) return undefined;
  const out: FilmOverrides = {};
  const eyebrow = cleanText(raw.eyebrow, HOME_LIMITS.eyebrow);
  if (eyebrow) out.eyebrow = eyebrow;
  const title = cleanText(raw.title, HOME_LIMITS.sectionTitle);
  if (title) out.title = title;
  const body = cleanText(raw.body, HOME_LIMITS.filmBody);
  if (body) out.body = body;
  const cta = cleanText(raw.cta, HOME_LIMITS.button);
  if (cta) out.cta = cta;
  const href = cleanHref(raw.href);
  if (href) out.href = href;
  return compact(out);
}

function cleanServices(raw: unknown): ServicesOverrides | undefined {
  if (!isObject(raw)) return undefined;
  const out: ServicesOverrides = {};
  if (Array.isArray(raw.items)) {
    const items = raw.items.slice(0, 3).map((item) => {
      const slot: { title?: HomeText; text?: HomeText } = {};
      if (isObject(item)) {
        const title = cleanText(item.title, HOME_LIMITS.serviceTitle);
        if (title) slot.title = title;
        const text = cleanText(item.text, HOME_LIMITS.serviceText);
        if (text) slot.text = text;
      }
      return slot;
    });
    if (items.some((slot) => slot.title || slot.text)) out.items = items;
  }
  const whatsappText = cleanText(raw.whatsappText, HOME_LIMITS.whatsappText);
  if (whatsappText) out.whatsappText = whatsappText;
  const whatsappCta = cleanText(raw.whatsappCta, HOME_LIMITS.button);
  if (whatsappCta) out.whatsappCta = whatsappCta;
  const whatsappMessage = cleanText(raw.whatsappMessage, HOME_LIMITS.whatsappMessage);
  if (whatsappMessage) out.whatsappMessage = whatsappMessage;
  return compact(out);
}

function cleanInstagram(raw: unknown): InstagramOverrides | undefined {
  if (!isObject(raw)) return undefined;
  const out: InstagramOverrides = {};
  if (Array.isArray(raw.photos)) {
    // Six positions; an invalid photo becomes "" (keep the original tile).
    const photos = raw.photos.slice(0, 6).map((photo) => (isHomeImageKey(photo) ? (photo as string) : ""));
    if (photos.some((photo) => photo !== "")) out.photos = photos;
  }
  const subtitle = cleanText(raw.subtitle, HOME_LIMITS.subtitle);
  if (subtitle) out.subtitle = subtitle;
  return compact(out);
}

/** Deep sanitiser: unknown sections/keys are dropped, and every empty section is dropped. */
export function cleanHome(raw: unknown): HomeOverrides {
  if (!isObject(raw)) return {};
  const out: HomeOverrides = {};
  const hero = cleanHero(raw.hero);
  if (hero) out.hero = hero;
  const trilogy = cleanProductRow(raw.trilogy);
  if (trilogy) out.trilogy = trilogy;
  const story = cleanStory(raw.story);
  if (story) out.story = story;
  const duo = cleanDuo(raw.duo);
  if (duo) out.duo = duo;
  const feature = cleanFeature(raw.feature);
  if (feature) out.feature = feature;
  const film = cleanFilm(raw.film);
  if (film) out.film = film;
  const homeGrid = cleanProductRow(raw.homeGrid);
  if (homeGrid) out.homeGrid = homeGrid;
  const services = cleanServices(raw.services);
  if (services) out.services = services;
  const instagram = cleanInstagram(raw.instagram);
  if (instagram) out.instagram = instagram;
  return out;
}

/** Every image key the overrides reference (manifest keys and uploads), for the delete warning. */
export function homeImageKeys(overrides: HomeOverrides): string[] {
  const keys = new Set<string>();
  if (overrides.story?.image) keys.add(overrides.story.image);
  if (overrides.story?.mobileImage) keys.add(overrides.story.mobileImage);
  for (const item of overrides.duo?.items ?? []) if (item.image) keys.add(item.image);
  if (overrides.feature?.image) keys.add(overrides.feature.image);
  for (const photo of overrides.instagram?.photos ?? []) if (photo) keys.add(photo);
  return [...keys];
}
