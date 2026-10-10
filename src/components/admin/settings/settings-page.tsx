"use client";

import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { useMounted } from "@/lib/hooks";
import { AccountSection } from "./account-section";
import { ContactSection } from "./contact-section";
import { DeliverySection } from "./delivery-section";
import { TickerSection } from "./ticker-section";

/**
 * Store settings: delivery fees, contact numbers, the top banner and the admin account. Everything
 * is saved in this browser only, so the page shows a skeleton until mounted and reads the live stores.
 */
export function SettingsPage() {
  const t = useTranslations("admin");
  const mounted = useMounted();

  if (!mounted) return <SettingsSkeleton />;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="caps font-serif text-title font-medium">{t("settings.title")}</h1>
      <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-muted">{t("settings.intro")}</p>
      <div className="mt-8 space-y-6">
        <DeliverySection />
        <ContactSection />
        <TickerSection />
        <AccountSection />
      </div>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="mx-auto max-w-3xl" aria-busy>
      <Skeleton className="h-9 w-56" />
      <Skeleton className="mt-4 h-5 w-80 max-w-full" />
      <div className="mt-8 space-y-6">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    </div>
  );
}
