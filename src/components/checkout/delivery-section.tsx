"use client";

import { Truck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Price } from "@/components/ui/price";
import { delivery } from "@/data/site";
import type { Locale } from "@/i18n/routing";
import { formatDay, standardArrival } from "@/lib/delivery";
import { useNow } from "@/lib/hooks";
import { useLiveSettings } from "@/lib/live";
import { Section } from "./form-helpers";

/** The single delivery option, with its fee and the next-day arrival worked out in Kuwait time. */
export function DeliverySection() {
  const t = useTranslations("checkout.delivery");
  const locale = useLocale() as Locale;
  const settings = useLiveSettings();
  const now = useNow(60_000);

  let note = t("checking");
  if (now) {
    const day = formatDay(standardArrival(now), locale);
    note = delivery.standard.leadDays === 1 ? t("standardTomorrow", { day }) : t("standardOn", { day });
  }

  return (
    <Section id="ck-delivery-title" title={t("legend")}>
      <div className="flex items-start gap-3 border border-line bg-paper p-4">
        <Truck className="mt-0.5 size-5 shrink-0 text-ink rtl:-scale-x-100" strokeWidth={1.25} aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15px] leading-snug font-medium">{t("legend")}</span>
          <span className="text-[13px] leading-snug text-muted">{note}</span>
        </div>
        <Price fils={settings.standardFeeFils} className="shrink-0 text-[15px]" />
      </div>
    </Section>
  );
}
