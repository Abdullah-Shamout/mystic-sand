import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

// One message file per feature so parallel workstreams never edit the same JSON.
export const namespaces = [
  "common",
  "home",
  "shop",
  "product",
  "cart",
  "checkout",
  "payment",
  "content",
  "legal",
  "admin",
] as const;

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const entries = await Promise.all(
    namespaces.map(
      async (ns) =>
        [ns, (await import(`../../messages/${locale}/${ns}.json`)).default] as const,
    ),
  );

  return {
    locale,
    // Node on this machine resolves to Etc/GMT-3; be explicit so builds are deterministic.
    timeZone: "Asia/Kuwait",
    messages: Object.fromEntries(entries),
  };
});
