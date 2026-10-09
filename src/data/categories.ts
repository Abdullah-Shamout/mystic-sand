import type { CategorySlug, ImageKey, Localized } from "./types";

export type Category = {
  slug: CategorySlug;
  name: Localized;
  description: Localized;
  banner: { desktop: ImageKey; mobile: ImageKey };
};

// The order here is the order of the menu, the footer and the shop chips.
export const categories: Category[] = [
  {
    slug: "perfumes",
    name: { en: "Perfumes", ar: "العطور" },
    description: {
      en: "The Trilogy and our signature 30 ml editions.",
      ar: "الثلاثية وإصداراتنا المميزة بحجم 30 مل.",
    },
    banner: { desktop: "lifestyle/roses-iii", mobile: "lifestyle/candles-duo" },
  },
  {
    slug: "oud",
    name: { en: "Oud", ar: "العود" },
    description: {
      en: "Cambodian and Indian oud to wear, and natural chips for the mabkhara.",
      ar: "عود كمبودي وهندي لتتعطّر به، وقطع عود طبيعي للمبخرة.",
    },
    banner: { desktop: "renders/oud", mobile: "renders/oud" },
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
      en: "Room and linen mists for every corner of your home.",
      ar: "معطّرات للغرف والمفارش لكل ركن في منزلك.",
    },
    banner: { desktop: "renders/dune", mobile: "renders/mist" },
  },
];

export const categoryBySlug = (slug: string) => categories.find((c) => c.slug === slug);
