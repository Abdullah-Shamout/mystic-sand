"use client";

import { type AbstractIntlMessages, NextIntlClientProvider, useLocale, useMessages } from "next-intl";
import { useMemo } from "react";

/**
 * The storefront provider (in the root layout) ships every namespace except `admin`.
 * This nested provider adds `admin` back for the back office only. A nested next-intl
 * provider *replaces* messages rather than merging, so we merge the parent's ourselves.
 */
export function AdminIntl({ admin, children }: { admin: AbstractIntlMessages; children: React.ReactNode }) {
  const locale = useLocale();
  const parent = useMessages();
  const messages = useMemo(() => ({ ...parent, admin }), [parent, admin]);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
