"use client";

import { Clock3, Truck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { delivery } from "@/data/site";
import type { Locale } from "@/i18n/routing";
import { expressStatus, formatDay, formatDuration, standardArrival } from "@/lib/delivery";
import { useNow } from "@/lib/hooks";

const strong = (chunks: React.ReactNode) => <strong className="font-medium text-ink">{chunks}</strong>;

const icon = "mt-0.5 size-[18px] shrink-0 text-ink";

/**
 * "Order within 2h 14m for 2-hour delivery today" and the standard arrival day, in
 * Kuwait time. Computed only after mount, so the static HTML never freezes a build date.
 */
export function DeliveryPromise() {
  const t = useTranslations("product.delivery");
  const locale = useLocale() as Locale;
  const now = useNow(30_000);

  if (!now) {
    return (
      <div aria-hidden className="space-y-2.5 py-0.5">
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-5 w-3/5" />
      </div>
    );
  }

  const express = expressStatus(now);
  const hours = delivery.express.windowMinutes / 60;
  const expressLine =
    express.state === "open"
      ? t.rich("expressOpen", {
          time: formatDuration(express.minutesLeft, locale),
          hours,
          h: String(hours),
          b: strong,
        })
      : t.rich(express.state === "later-today" ? "expressLater" : "expressTomorrow", {
          time: express.opensAt,
          b: strong,
        });

  return (
    <ul className="space-y-2 text-[14px] leading-snug text-muted">
      <li className="flex gap-3">
        <Clock3 className={icon} strokeWidth={1.25} aria-hidden />
        <span>{expressLine}</span>
      </li>
      <li className="flex gap-3">
        <Truck className={icon} strokeWidth={1.25} aria-hidden />
        <span>{t.rich("standard", { day: formatDay(standardArrival(now), locale), b: strong })}</span>
      </li>
    </ul>
  );
}
