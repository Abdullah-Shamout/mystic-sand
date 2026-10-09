"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { Price } from "@/components/ui/price";
import { delivery } from "@/data/site";
import type { Locale } from "@/i18n/routing";
import { expressStatus, formatDay, formatDuration, standardArrival } from "@/lib/delivery";
import { useNow } from "@/lib/hooks";
import { isolatedKWD } from "@/lib/money";
import { computeTotals } from "@/lib/pricing";
import type { CheckoutForm } from "@/lib/validation";
import { useBag } from "@/store/bag";
import { anchorId, ChoiceCard, iso, Section } from "./form-helpers";

/** Standard vs 2-hour express, with real dates and cut-offs worked out in Kuwait time after mount. */
export function DeliverySection({ expressClosedNotice }: { expressClosedNotice: boolean }) {
  const t = useTranslations("checkout.delivery");
  const locale = useLocale() as Locale;
  const { register, getValues, setValue } = useFormContext<CheckoutForm>();
  const lines = useBag((s) => s.lines);
  const promo = useBag((s) => s.promo);
  const now = useNow(30_000);

  const standard = computeTotals({ lines, promo, deliveryMethod: "standard" });
  const status = now ? expressStatus(now) : null;
  const expressState = status?.state ?? null;
  const expressAvailable = expressState === null || expressState === "open";

  // Express closed while the page was open (or a saved draft chose it): fall back to standard.
  useEffect(() => {
    if (expressState && expressState !== "open" && getValues("deliveryMethod") === "express") {
      setValue("deliveryMethod", "standard", { shouldDirty: true });
    }
  }, [expressState, getValues, setValue]);

  let standardNote = t("checking");
  if (now) {
    const day = formatDay(standardArrival(now), locale);
    standardNote = delivery.standard.leadDays === 1 ? t("standardTomorrow", { day }) : t("standardOn", { day });
  }

  let expressNote = t("checking");
  if (status?.state === "open") expressNote = t("expressOpen", { time: iso(formatDuration(status.minutesLeft, locale)) });
  else if (status?.state === "later-today") expressNote = t("expressLaterToday", { time: iso(status.opensAt) });
  else if (status?.state === "tomorrow") expressNote = t("expressTomorrow", { time: iso(status.opensAt) });

  return (
    <Section id="ck-delivery-title" title={t("legend")}>
      <div id={anchorId("deliveryMethod")} className="grid gap-3">
        <ChoiceCard
          value="standard"
          {...register("deliveryMethod")}
          title={t("standard")}
          description={
            <>
              {standardNote}
              {!standard.qualifiesFreeDelivery && (
                <span className="block">
                  {t("freeOver", { amount: isolatedKWD(standard.freeDeliveryThresholdFils, locale) })}
                </span>
              )}
            </>
          }
          aside={<Price fils={standard.deliveryFils} free className="text-[15px]" />}
        />
        <ChoiceCard
          value="express"
          {...register("deliveryMethod")}
          disabled={!expressAvailable}
          title={t("express")}
          description={expressNote}
          aside={<Price fils={delivery.express.feeFils} className="text-[15px]" />}
        />
      </div>
      {expressClosedNotice && (
        <p role="alert" className="mt-3 text-[14px] text-danger">
          {t("expressClosed")}
        </p>
      )}
    </Section>
  );
}
