import type { Metadata, Viewport } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Providers } from "@/components/layout/providers";
import { directionOf, routing } from "@/i18n/routing";
import { fontStacks } from "../fonts";
import "../globals.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#004225",
};

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  return {
    ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
    title: { default: t("meta.title"), template: `%s · ${t("brand")}` },
    description: t("meta.description"),
    // Demo site with placeholder prices and a simulated gateway: keep it out of search engines.
    robots: { index: false, follow: false },
    openGraph: { siteName: t("brand"), locale: locale === "ar" ? "ar_KW" : "en_KW", type: "website" },
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("common");
  const dir = directionOf(locale);
  const stacks = fontStacks(locale);

  return (
    <html
      lang={locale}
      dir={dir}
      data-scroll-behavior="smooth"
      style={{ "--ms-sans": stacks.sans, "--ms-serif": stacks.serif } as React.CSSProperties}
    >
      <body>
        <a
          href="#main"
          className="sr-only z-[80] bg-ink px-4 py-3 text-paper focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
        >
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider>
          <Providers dir={dir}>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
