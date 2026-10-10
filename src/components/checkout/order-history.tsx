"use client";

import { ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { Skeleton } from "@/components/ui/skeleton";
import { hasImage } from "@/lib/media";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/delivery";
import { useMounted } from "@/lib/hooks";
import { useCheckout, type Order } from "@/store/checkout";
import { iso } from "./form-helpers";

function OrderRow({ order }: { order: Order }) {
  const t = useTranslations("checkout.orders");
  const locale = useLocale() as Locale;
  const items = order.lines.reduce((n, l) => n + l.qty, 0);
  const thumbs = order.lines.filter((l) => hasImage(l.image)).slice(0, 3);

  return (
    <li className="group relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-6 md:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto] md:gap-x-8">
      <div className="flex gap-1" aria-hidden>
        {thumbs.map((line, i) => (
          <div key={line.sku} className={cn("relative size-14 bg-tile", i > 0 && "hidden md:block")}>
            <ResponsiveImage image={line.image} alt="" sizes="56px" />
          </div>
        ))}
      </div>
      <div className="min-w-0">
        <Link
          href={`/checkout/result?order=${encodeURIComponent(order.id)}`}
          className="font-medium after:absolute after:inset-0 group-hover:underline group-hover:underline-offset-4"
          aria-label={t("viewLabel", { id: iso(order.id) })}
        >
          <bdi className="figures">{order.id}</bdi>
        </Link>
        <p className="text-[13px] text-muted">{t("placed", { date: formatDateTime(order.createdAt, locale) })}</p>
      </div>
      <ChevronRight
        className="size-5 shrink-0 text-muted transition-colors group-hover:text-ink md:order-last rtl:-scale-x-100"
        strokeWidth={1.25}
        aria-hidden
      />
      <div className="col-span-3 flex flex-wrap items-center gap-x-4 gap-y-2 md:col-span-1">
        {/* Only paid orders are ever listed, so every one reads "Confirmed". */}
        <span className="caps inline-flex min-h-6 items-center border border-racing bg-racing px-2 text-[11px] font-medium text-cream">
          {t("statuses.paid")}
        </span>
        <span className="text-[13px] text-muted">{t(`methods.${order.method}`)}</span>
      </div>
      <div className="col-span-3 flex items-baseline justify-between gap-4 md:col-span-1 md:flex-col md:items-end md:gap-0">
        <span className="text-[13px] text-muted">{t("items", { count: items })}</span>
        <Price fils={order.totals.totalFils} className="text-[15px] font-medium" />
      </div>
    </li>
  );
}

/** Orders placed on this device (no accounts in the prototype), newest first. */
export function OrderHistory() {
  const t = useTranslations("checkout.orders");
  const mounted = useMounted();
  const orders = useCheckout((s) => s.orders);

  if (!mounted) {
    return (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  // Shoppers only ever see paid orders here — failed, canceled or still-pending attempts (and any
  // old "confirming" order from stored data) never appear, each listed as "Confirmed".
  const list = Object.values(orders)
    .filter((o) => o.status === "paid")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center border-y border-line px-6 py-16 text-center">
        <p className="caps font-serif text-title-sm font-medium">{t("emptyTitle")}</p>
        <p className="mt-3 max-w-sm text-[15px] text-muted">{t("emptyText")}</p>
        <Button asChild className="mt-8">
          <Link href="/shop">{t("cta")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line border-y border-line" data-testid="order-history">
      {list.map((order) => (
        <OrderRow key={order.id} order={order} />
      ))}
    </ul>
  );
}
