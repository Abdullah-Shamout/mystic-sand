import type { CategorySlug, ImageKey, Localized } from "./types";

export type Category = {
  slug: CategorySlug;
  name: Localized;
  description: Localized;
  banner: { desktop: ImageKey; mobile: ImageKey };
};

export const categories: Category[] = [
  {
    slug: "eau-de-parfum",
    name: { en: "Eau de Parfum", ar: "العطور" },
    description: {
      en: "The Trilogy and our signature 30 ml editions.",
      ar: "الثلاثية وإصداراتنا المميزة بحجم 30 مل.",
    },
    banner: { desktop: "lifestyle/roses-iii", mobile: "lifestyle/candles-duo" },
  },
  {
    slug: "body",
    name: { en: "Body", ar: "الجسم" },
    description: {
      en: "Light, joyful veils for skin, hair and clothes.",
      ar: "رذاذ خفيف ومبهج للبشرة والشعر والملابس.",
    },
    banner: { desktop: "renders/aura", mobile: "renders/aura" },
  },
  {
    slug: "home",
    name: { en: "Home", ar: "المنزل" },
    description: {
      en: "Room mists and natural oud for every corner of your home.",
      ar: "معطّرات للغرف وعود طبيعي لكل ركن في منزلك.",
    },
    banner: { desktop: "renders/dune", mobile: "renders/mist" },
  },
  {
    slug: "gift-sets",
    name: { en: "Gift Sets", ar: "مجموعات الهدايا" },
    description: {
      en: "Thoughtful sets, beautifully wrapped.",
      ar: "مجموعات مختارة بعناية، مغلّفة بأناقة.",
    },
    banner: { desktop: "lifestyle/trio-basket", mobile: "lifestyle/trio-basket" },
  },
];

export const categoryBySlug = (slug: string) => categories.find((c) => c.slug === slug);
