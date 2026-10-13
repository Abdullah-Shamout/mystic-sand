"use client";

import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { useMounted } from "@/lib/hooks";
import { AccountSection } from "./account-section";
import { ContactSection } from "./contact-section";
import { DeliverySection } from "./delivery-section";

/**
 * Store settings: delivery fees, contact numbers and the admin account. Everything is saved in this
 * browser only, so the page shows a skeleton until mounted and reads the live stores. The top banner
 * moved to the Home page editor.
 */
export function SettingsPage() {
  const t = useTranslations("admin");
  const mounted = useMounted();

  if (!mounted) return <SettingsSkeleton />;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="caps font-serif text-title font-medium">{t("settings.title")}</h1>
      <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-muted">{t("settings.intro")}</p>
      <p className="mt-2 max-w-prose text-[14px] leading-relaxed text-muted">
        {t.rich("settings.tickerMoved", {
          link: (chunks) => (
            <Link href="/admin/home" className="text-ink underline underline-offset-4 transition-opacity hover:opacity-70">
              {chunks}
            </Link>
          ),
        })}
      </p>
      <div className="mt-8 space-y-6">
        <DeliverySection />
        <ContactSection />
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
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    </div>
  );
}
