import type { Locale } from "@/i18n/routing";
import { delivery } from "@/data/site";

// Delivery promises depend on "now" in Kuwait. Call these only in the browser,
// after mount (never during render), so static HTML never freezes a build date.

const TZ = "Asia/Kuwait";

type KuwaitClock = { year: number; month: number; day: number; minutes: number; weekday: string };

export function kuwaitClock(date: Date): KuwaitClock {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    weekday: String(parts.weekday),
  };
}

/** Delivery arrives `leadDays` after today (Kuwait calendar). */
export function standardArrival(now: Date): Date {
  return new Date(now.getTime() + delivery.standard.leadDays * 24 * 60 * 60 * 1000);
}

export function formatDay(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-KW-u-nu-latn" : "en-GB", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

export function formatDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-KW-u-nu-latn" : "en-GB", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
