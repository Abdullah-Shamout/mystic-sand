"use client";

import { CircleCheck, Printer, Truck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
import { WhatsAppIcon } from "@/components/brand/brand-icons";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatDay, standardArrival } from "@/lib/delivery";
import { useLiveSettings } from "@/lib/live";
import { isolatedKWD } from "@/lib/money";
import { whatsappHref } from "@/lib/settings";
import type { PaymentRecord } from "@/lib/payments/types";
import { useBag } from "@/store/bag";
import { useCheckout, type Order } from "@/store/checkout";
import { useUi } from "@/store/ui";
import { DeliveryDetails } from "./delivery-details";
import { firstName, isolate } from "./format";
import { Invoice } from "./invoice";
import { OrderSummary } from "./order-summary";
import { PaymentDetails } from "./payment-details";
import { StatusTimeline } from "./status-timeline";
import { useFocusOnMount } from "./use-focus-on-mount";

// Printing leaves only the invoice: the screen view is print:hidden, and the shared
// checkout header is hidden here (it carries no print variant of its own).
const PRINT_CSS = "@media print { @page { margin: 14mm; } header { display: none !important; } }";

export function ResultSuccess({ order, attempt }: { order: Order; attempt: PaymentRecord }) {
  const t = useTranslations("payment");
  const locale = useLocale() as Locale;
  const announce = useUi((s) => s.announce);
  const settings = useLiveSettings();
  const heading = useFocusOnMount<HTMLHeadingElement>();

  useEffect(() => {
    // Exactly once per order: a refresh, Back or a later visit finds it finalized and changes nothing.
    if (useCheckout.getState().finalize(order.id, new Date())) {
      useBag.getState().clear();
      announce(t("success.announce", { id: order.id }));
    }
  }, [order.id, announce, t]);

  const name = firstName(order.details.name);
  const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;

  // Promised from the moment of payment, so a later visit still shows the original estimate.
  const paidAt = new Date(attempt.at);
  const estimate = t("success.deliveryStandard", { day: formatDay(standardArrival(paidAt), locale) });

  const shareText = t("success.shareText", {
    id: isolate(order.id),
    lines: order.lines
      .map(
        (l) =>
          `• ${isolate(l.name)} · ${isolate(l.size[locale])} × ${l.qty} — ${isolatedKWD(l.priceFils * l.qty, locale)}`,
      )
      .join("\n"),
    total: isolatedKWD(order.totals.totalFils, locale),
    method: t(`methods.${attempt.method}`),
    ref: isolate(attempt.ref ?? attempt.paymentId),
  });

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="print:hidden" data-testid="result-success">
        <section className="border-b border-line">
          <div className="mx-auto max-w-[760px] px-4 pt-12 pb-14 text-center md:pt-16 md:pb-16">
            <CircleCheck className="mx-auto size-12 text-racing" strokeWidth={1} aria-hidden />
            <h1
              ref={heading}
              tabIndex={-1}
              className="caps mt-6 font-serif text-title-sm font-medium outline-none md:text-title"
            >
              {name ? t.rich("success.title", { name, bdi }) : t("success.titleNoName")}
            </h1>
            <p className="mt-3 text-[17px]">
              {t.rich("success.confirmed", {
                id: order.id,
                bdi: (chunks) => <bdi className="figures font-medium">{chunks}</bdi>,
              })}
            </p>
            <p className="mx-auto mt-2 max-w-md text-[15px] text-muted">{t("success.text")}</p>
            <p className="mt-6 inline-flex items-center gap-2.5 bg-tile px-4 py-2.5 text-[15px]" data-testid="delivery-estimate">
              <Truck className="size-[18px] shrink-0 rtl:-scale-x-100" strokeWidth={1.25} aria-hidden />
              {estimate}
            </p>
            <StatusTimeline className="mx-auto mt-10 max-w-[560px]" />
            <div
              role="group"
              aria-label={t("success.actions")}
              className="mt-12 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center"
            >
              <Button asChild>
                <Link href="/shop">{t("success.continue")}</Link>
              </Button>
              <Button variant="secondary" onClick={() => window.print()} data-testid="print-invoice">
                <Printer className="size-4" strokeWidth={1.25} aria-hidden />
                {t("success.print")}
              </Button>
              <Button asChild variant="secondary">
                <a href={whatsappHref(settings, shareText)} target="_blank" rel="noopener noreferrer">
                  <WhatsAppIcon className="size-4" />
                  {t("success.share")}
                </a>
              </Button>
            </div>
          </div>
        </section>

        <div className="mx-auto grid max-w-[1100px] gap-12 px-4 py-12 md:px-6 md:py-16 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-16">
          <div className="space-y-14">
            <OrderSummary order={order} />
            <DeliveryDetails order={order} />
          </div>
          <div>
            <PaymentDetails attempt={attempt} className="lg:sticky lg:top-6" />
          </div>
        </div>
      </div>
      <Invoice order={order} attempt={attempt} />
    </>
  );
}
