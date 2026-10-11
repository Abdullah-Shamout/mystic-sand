"use client";

import { useLocale, useTranslations } from "next-intl";
import { CatalogGrid } from "@/components/product/catalog-grid";
import { SectionTitle } from "@/components/ui/section-title";
import type { Locale } from "@/i18n/routing";
import { HOME_DEFAULTS, textOr } from "@/lib/home";
import { useLiveHome } from "@/lib/live";

/**
 * A titled product band (the trilogy, or "For the home"): the heading texts and the shown
 * products both come from the home overrides, falling back to the built-ins. CatalogGrid already
 * skips hidden or missing products.
 */
export function HomeProductGrid({ section, columns = 4 }: { section: "trilogy" | "homeGrid"; columns?: 3 | 4 }) {
  const t = useTranslations("home");
  const locale = useLocale() as Locale;
  const o = useLiveHome()[section];
  const slugs = o?.products ?? HOME_DEFAULTS[section].products;

  return (
    <section data-home-section={section}>
      <SectionTitle title={textOr(o?.title, locale, t(`${section}.title`))} subtitle={textOr(o?.subtitle, locale, t(`${section}.subtitle`))} />
      <CatalogGrid slugs={slugs} columns={columns} />
    </section>
  );
}
