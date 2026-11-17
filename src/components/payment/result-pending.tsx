"use client";

import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";

import { WhatsAppIcon } from "@/components/brand/brand-icons";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { Link } from "@/i18n/navigation";
import { useLiveSettings } from "@/lib/live";
import { whatsappHref } from "@/lib/settings";
import type { Order } from "@/store/checkout";
import { isolate } from "./format";
import { useFocusOnMount } from "./use-focus-on-mount";

/**
 * A still-PENDING order: the provider has not reported an outcome yet (e.g. the shopper returned
 * before the payment settled). This is a NEUTRAL "we're confirming your payment" state — deliberately
 * NOT the failed view: it never says "not charged" or offers a "Try again" that would start a second
 * payment. Stale pending orders are reconciled server-side (settle-or-cancel) out of band.
 */
export function ResultPending({ order }: { order: Order }) {
  const t = useTranslations("payment");
  const settings = useLiveSettings();
  const heading = useFocusOnMount<HTMLHeadingElement>();

  return (
    <div className="mx-auto max-w-[640px] px-4 py-12 md:py-20" data-testid="result-pending">
      <div className="text-center">
        <Clock className="mx-auto size-12 text-muted" strokeWidth={1} aria-hidden />
        <h1
          ref={heading}
          tabIndex={-1}
          className="caps mt-6 font-serif text-title-sm font-medium outline-none md:text-title"
        >
          {t("pending.title")}
        </h1>
        <p className="mt-3 text-[17px]">{t("pending.text")}</p>
        <p className="mt-2 text-[15px] text-muted">
          {t.rich("pending.order", {
            id: order.id,
            bdi: (chunks) => <bdi className="figures">{chunks}</bdi>,
          })}{" "}
          · <Price fils={order.totals.totalFils} />
        </p>
      </div>

      <div className="mt-10 grid gap-3">
        <Button asChild size="lg" variant="secondary" block>
          <Link href="/shop">{t("pending.continue")}</Link>
        </Button>
      </div>

      <p className="mt-8 text-center">
        <a
          href={whatsappHref(settings, t("pending.helpText", { id: isolate(order.id) }))}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 text-[14px] underline underline-offset-4 hover:decoration-2"
        >
          <WhatsAppIcon className="size-4" />
          {t("pending.help")}
        </a>
      </p>
    </div>
  );
}
