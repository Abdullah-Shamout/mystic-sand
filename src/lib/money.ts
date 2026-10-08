import type { Locale } from "@/i18n/routing";

// Money is stored as integer fils (1 KWD = 1000 fils). Formatting is done by hand
// rather than with Intl: ICU output for KWD differs between Node and mobile
// browsers (hidden RTL marks, Arabic-Indic digits), which breaks hydration.

export const FILS_PER_KWD = 1000;

export function formatAmount(fils: number): string {
  const sign = fils < 0 ? "-" : "";
  const abs = Math.abs(Math.round(fils));
  const dinars = Math.floor(abs / FILS_PER_KWD);
  const rest = abs % FILS_PER_KWD;
  const grouped = String(dinars).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${grouped}.${String(rest).padStart(3, "0")}`;
}

/** "KWD 28.000" in English, "28.000 د.ك" in Arabic (Latin digits in both). */
export function formatKWD(fils: number, locale: Locale): string {
  const amount = formatAmount(fils);
  return locale === "ar" ? `${amount} د.ك` : `KWD ${amount}`;
}

/** For text that is not rendered inside <bdi> (aria-labels, WhatsApp text…). */
export function isolatedKWD(fils: number, locale: Locale): string {
  return `⁨${formatKWD(fils, locale)}⁩`;
}
