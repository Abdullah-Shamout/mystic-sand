import { toLatinDigits } from "./digits";

// Kuwaiti mobiles: 8 digits starting with 5 (stc), 6 (Ooredoo), 9 (Zain) or 41 (Virgin).
// Numbers are portable, so prefixes are not mapped to carriers.
export const KW_MOBILE = /^(?:[569]\d{7}|41\d{6})$/;

/** Strips spaces, punctuation and +965 / 00965 / 965, and converts Arabic digits. */
export function normalizeKuwaitPhone(input: string): string {
  let s = toLatinDigits(input).replace(/[\s\-().‎‏⁦-⁩]/g, "");
  s = s.replace(/^(?:\+|00)?965(?=\d{8}$)/, "");
  return s;
}

export type PhoneStatus = "empty" | "valid" | "landline" | "invalid";

export function phoneStatus(input: string): PhoneStatus {
  const s = normalizeKuwaitPhone(input);
  if (!s) return "empty";
  if (KW_MOBILE.test(s)) return "valid";
  if (/^2\d{7}$/.test(s)) return "landline";
  return "invalid";
}

/** "+965 9123 4567" */
export function formatKuwaitPhone(local: string): string {
  const s = normalizeKuwaitPhone(local);
  if (s.length !== 8) return s;
  return `+965 ${s.slice(0, 4)} ${s.slice(4)}`;
}
