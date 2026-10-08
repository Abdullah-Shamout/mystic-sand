import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "ar"],
  defaultLocale: "en",
  localePrefix: "always",
  // Static export: there is no proxy/middleware to read or write a locale cookie.
  localeCookie: false,
});

export type Locale = (typeof routing.locales)[number];

export const directionOf = (locale: Locale) => (locale === "ar" ? "rtl" : "ltr");
