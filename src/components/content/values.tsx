import type { RichTranslationValues } from "next-intl";
import { LiveFee, LivePhone } from "@/components/settings/live";
import { delivery, payments, site } from "@/data/site";
import type { Locale } from "@/i18n/routing";
import { isolatedKWD } from "@/lib/money";
import { defaultSettings, feeFor, phoneDisplay } from "@/lib/settings";

/** Left-to-right isolate for phone numbers, times and IDs inside running Arabic text. */
export const ltr = (text: string) => `⁦${text}⁩`;

// Arabic counted nouns change form with the number. These forms read naturally
// after a preposition: "خلال ساعتين", "خلال 3 أيام", "خلال 14 يوماً".
function arabicCount(n: number, forms: { one: string; two: string; few: string; many: string; other: string }) {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  if (n >= 3 && n <= 10) return `${n} ${forms.few}`;
  if (n >= 11 && n <= 99) return `${n} ${forms.many}`;
  return `${n} ${forms.other}`;
}

export function formatDays(n: number, locale: Locale) {
  if (locale === "en") return `${n} ${n === 1 ? "day" : "days"}`;
  return arabicCount(n, { one: "يوم واحد", two: "يومين", few: "أيام", many: "يوماً", other: "يوم" });
}

export function formatHours(n: number, locale: Locale) {
  if (locale === "en") return `${n} ${n === 1 ? "hour" : "hours"}`;
  return arabicCount(n, { one: "ساعة واحدة", two: "ساعتين", few: "ساعات", many: "ساعة", other: "ساعة" });
}

/** "2 hours" / "ساعتين" — the express delivery window from site.ts. */
export function expressWindow(locale: Locale) {
  const minutes: number = delivery.express.windowMinutes;
  if (minutes % 60 === 0) return formatHours(minutes / 60, locale);
  return locale === "ar" ? `${minutes} دقيقة` : `${minutes} minutes`;
}

/** When standard delivery arrives, phrased to follow a verb ("arrive the next day"). */
export function standardWhen(locale: Locale) {
  const days: number = delivery.standard.leadDays;
  if (days === 0) return locale === "ar" ? "في اليوم نفسه" : "the same day";
  if (days === 1) return locale === "ar" ? "في اليوم التالي" : "the next day";
  return locale === "ar" ? `خلال ${formatDays(days, locale)}` : `within ${formatDays(days, locale)}`;
}

/**
 * Store facts injected into content and policy messages ({standardFee}, {returnsWindow}…),
 * so copy never drifts from the settings. The fee/phone values here are the defaults; the
 * live values are injected by liveStoreValues below. All values are strings: ICU would
 * format numbers with Arabic-Indic digits, and the site uses Latin digits.
 */
export function storeValues(locale: Locale): Record<string, string> {
  return {
    brand: site.brand,
    tradeName: site.trade.name[locale],
    cr: ltr(site.trade.cr),
    phone: ltr(phoneDisplay(defaultSettings)),
    email: ltr(site.email),
    handle: ltr(`@${site.instagram.handle}`),
    standardFee: isolatedKWD(feeFor(defaultSettings, "standard"), locale),
    expressFee: isolatedKWD(feeFor(defaultSettings, "express"), locale),
    expressWindow: expressWindow(locale),
    standardWhen: standardWhen(locale),
    opens: ltr(delivery.express.opens),
    lastOrder: ltr(delivery.express.lastOrder),
    fridayOpens: ltr(delivery.express.fridayOpens),
    returnsWindow: formatDays(delivery.returnsDays, locale),
    otpFrom: isolatedKWD(payments.otpFromFils, locale),
  };
}

/**
 * storeValues with the delivery fees and phone swapped for live client elements, so content
 * and policy pages follow the admin's settings. These are only ever passed to `t.rich`, which
 * renders element values as-is at runtime; RichTranslationValues' type doesn't allow React
 * elements, hence the single cast.
 */
export function liveStoreValues(locale: Locale): RichTranslationValues {
  return {
    ...storeValues(locale),
    standardFee: <LiveFee key="standardFee" kind="standard" />,
    expressFee: <LiveFee key="expressFee" kind="express" />,
    phone: <LivePhone key="phone" isolate />,
  } as unknown as RichTranslationValues;
}
