import type { Locale } from "@/i18n/routing";
import type { Product } from "@/data/types";
import { toLatinDigits } from "./digits";

/** Case-, accent- and Arabic-letter-insensitive form (cafe ↔ CAFÉ, أورا ↔ اورا). */
export function normalizeSearch(input: string): string {
  return toLatinDigits(input)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ـ/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function searchProducts(query: string, products: Product[], locale: Locale): Product[] {
  const q = normalizeSearch(query);
  if (!q) return [];
  const scored = products
    .map((p) => {
      const name = normalizeSearch(p.name);
      const fields = [
        p.type[locale],
        p.type.en,
        p.family?.[locale] ?? "",
        p.tagline[locale],
        ...p.aliases,
        ...(p.notes ? [...p.notes.top, ...p.notes.heart, ...p.notes.base].flatMap((x) => [x.en, x.ar]) : []),
      ].map(normalizeSearch);
      let score = 0;
      if (name === q) score += 100;
      else if (name.startsWith(q)) score += 60;
      else if (name.includes(q)) score += 40;
      for (const f of fields) {
        if (f === q) score += 30;
        else if (f.startsWith(q)) score += 15;
        else if (f.includes(q)) score += 8;
      }
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score);
  return scored.map((x) => x.p);
}
