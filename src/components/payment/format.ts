import type { Locale } from "@/i18n/routing";
import { banks } from "@/data/banks";
import { kuwaitClock } from "@/lib/delivery";

/** FSI…PDI isolation for plain-text contexts (WhatsApp text, aria-labels). */
const FSI = String.fromCharCode(0x2068);
const PDI = String.fromCharCode(0x2069);
export const isolate = (text: string) => `${FSI}${text}${PDI}`;

/** 420 → "7:00" */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Kuwait wall-clock time, "18:45" (Latin digits). */
export function kuwaitTime(date: Date): string {
  const { minutes } = kuwaitClock(date);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

export const bankName = (id: string | null | undefined, locale: Locale) =>
  id ? banks.find((b) => b.id === id)?.name[locale] : undefined;

/** Shown as a code: "482913" → "482 913". */
export const groupCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;
