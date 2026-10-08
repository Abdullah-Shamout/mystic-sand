import type { Locale } from "@/i18n/routing";

export type Localized = { en: string; ar: string };

export const tr = (value: Localized, locale: Locale) => value[locale];

export type CategorySlug = "eau-de-parfum" | "body" | "home" | "gift-sets";

/** Keys of src/data/media.generated.json */
export type ImageKey = string;

export type Variant = {
  sku: string;
  size: Localized;
  priceFils: number;
  stock: number;
};

export type Notes = {
  top: Localized[];
  heart: Localized[];
  base: Localized[];
};

export type Product = {
  slug: string;
  /** Name exactly as printed on the packaging (Latin, also used in Arabic UI). */
  name: string;
  category: CategorySlug;
  collection?: "trilogy";
  type: Localized;
  family?: Localized;
  tagline: Localized;
  description: Localized;
  notes?: Notes;
  howTo: Localized;
  variants: Variant[];
  images: {
    card: ImageKey;
    hover?: ImageKey;
    gallery: ImageKey[];
  };
  badge?: "new" | "set";
  related: string[];
  /** Extra search terms (Arabic names, spellings). */
  aliases: string[];
  /** Which fields are still placeholders, for the client review list. */
  todo: Array<"price" | "notes" | "size" | "copy">;
};
