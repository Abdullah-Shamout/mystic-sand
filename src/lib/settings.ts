import { formatKuwaitPhone, normalizeKuwaitPhone, phoneStatus } from "./phone";

// Store settings the admin can change at runtime. This module is pure (no React, no
// zustand): the live getters in src/lib/live.ts resolve the stored overrides against it.

export type StoreSettings = {
  standardFeeFils: number;
  expressFeeFils: number;
  /** WhatsApp number in international form, "965XXXXXXXX". */
  whatsapp: string;
  /** Contact phone, 8 local digits. */
  phone: string;
  /** Announcement-bar messages per locale; an empty list keeps the built-in messages. */
  ticker: { en: string[]; ar: string[] };
};

// Must match what src/data/site.ts held before the live layer, so nothing on screen changes
// until the admin saves an override.
export const defaultSettings: StoreSettings = {
  standardFeeFils: 1000,
  expressFeeFils: 3000,
  whatsapp: "96590000000",
  phone: "90000000",
  ticker: { en: [], ar: [] },
};

const FEE_MIN = 0;
const FEE_MAX = 50000;
const TICKER_MAX = 4;
const TICKER_CHARS = 90;

const isFee = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= FEE_MIN && value <= FEE_MAX;

/** A valid Kuwaiti mobile (accepts +965 / 965 / local forms), reusing the phone helpers. */
const isWhatsapp = (value: unknown): value is string =>
  typeof value === "string" && phoneStatus(value) === "valid";

const isPhone = (value: unknown): value is string =>
  typeof value === "string" && /^\d{8}$/.test(normalizeKuwaitPhone(value));

const cleanTicker = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null;
  const messages = value
    .filter((m): m is string => typeof m === "string")
    .map((m) => m.trim())
    .filter((m) => m.length > 0 && m.length <= TICKER_CHARS)
    .slice(0, TICKER_MAX);
  return messages;
};

/** Validates each override against the rules and falls back to the default per field. */
export function resolveSettings(overrides: Partial<StoreSettings> | undefined | null): StoreSettings {
  const o = overrides ?? {};
  const enTicker = cleanTicker(o.ticker?.en);
  const arTicker = cleanTicker(o.ticker?.ar);
  return {
    standardFeeFils: isFee(o.standardFeeFils) ? o.standardFeeFils : defaultSettings.standardFeeFils,
    expressFeeFils: isFee(o.expressFeeFils) ? o.expressFeeFils : defaultSettings.expressFeeFils,
    whatsapp: isWhatsapp(o.whatsapp) ? `965${normalizeKuwaitPhone(o.whatsapp)}` : defaultSettings.whatsapp,
    phone: isPhone(o.phone) ? normalizeKuwaitPhone(o.phone) : defaultSettings.phone,
    ticker: {
      en: enTicker ?? defaultSettings.ticker.en,
      ar: arTicker ?? defaultSettings.ticker.ar,
    },
  };
}

/** wa.me link — identical output to the old whatsappLink in src/data/site.ts. */
export const whatsappHref = (settings: StoreSettings, text: string) =>
  `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(text)}`;

/** "tel:+965…" — identical to the old telHref in src/components/content/values.ts. */
export const telHref = (settings: StoreSettings) => `tel:+965${settings.phone}`;

/** "+965 9000 0000" — identical to the old site.phoneDisplay. */
export const phoneDisplay = (settings: StoreSettings) => formatKuwaitPhone(settings.phone);

/** The WhatsApp number written the way the rest of the site writes numbers. */
export const whatsappDisplay = (settings: StoreSettings) =>
  formatKuwaitPhone(settings.whatsapp.replace(/^965/, ""));

export const feeFor = (settings: StoreSettings, method: "standard" | "express"): number =>
  method === "express" ? settings.expressFeeFils : settings.standardFeeFils;
