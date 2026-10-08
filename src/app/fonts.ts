import {
  Cormorant_Garamond,
  IBM_Plex_Sans_Arabic,
  Jost,
  Reem_Kufi,
} from "next/font/google";
import type { Locale } from "@/i18n/routing";

// Headings and product names: the classic serif printed on the labels.
export const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

// UI and body: geometric sans, close to Amouage's Gotham.
export const jost = Jost({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
});

// Arabic faces are not preloaded so English pages don't download them.
export const reemKufi = Reem_Kufi({
  subsets: ["arabic"],
  weight: ["400", "500"],
  display: "swap",
  preload: false,
});

export const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500"],
  display: "swap",
  preload: false,
});

// next/font's family string includes an Arial-based metric fallback, and Arial
// has Arabic glyphs. In Arabic stacks we therefore keep only the Latin web font's
// own family (Latin glyphs: I, II, CAFÉ, KWD, digits) and let Arabic letters fall
// through to the Arabic face via unicode-range.
const primaryFamily = (font: { style: { fontFamily: string } }) =>
  font.style.fontFamily.split(",")[0].trim();

export function fontStacks(locale: Locale) {
  if (locale === "ar") {
    return {
      sans: `${primaryFamily(jost)}, ${plexArabic.style.fontFamily}, system-ui, sans-serif`,
      serif: `${primaryFamily(cormorant)}, ${reemKufi.style.fontFamily}, serif`,
    };
  }
  return {
    sans: `${jost.style.fontFamily}, system-ui, sans-serif`,
    serif: `${cormorant.style.fontFamily}, Georgia, serif`,
  };
}
