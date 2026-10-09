"use client";

import { MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormContext, useWatch } from "react-hook-form";
import { formatKuwaitPhone } from "@/lib/phone";
import type { CheckoutForm } from "@/lib/validation";
import { useAddressFormatter } from "./address-format";

/** Returning shoppers: saved contact + address collapsed into one line, so Pay is in reach. */
export function DeliverToCard({ onChange }: { onChange: () => void }) {
  const t = useTranslations("checkout.returning");
  const tf = useTranslations("checkout.format");
  const format = useAddressFormatter();
  const { control } = useFormContext<CheckoutForm>();
  const [name, phone, areaId, housing, block, street, avenue, building, floor, apartment] = useWatch({
    control,
    name: ["name", "phone", "areaId", "housing", "block", "street", "avenue", "building", "floor", "apartment"],
  });
  const address = format({ areaId, housing, block, street, avenue, building, floor, apartment });
  const line = [address.area, address.street, address.building].filter(Boolean).join(tf("separator"));

  return (
    <section aria-labelledby="ck-deliver-title" className="border-t border-line pt-8">
      <div className="flex items-start gap-4 border border-line bg-tile/60 p-5 sm:p-6">
        <MapPin className="mt-1 size-5 shrink-0" strokeWidth={1.25} aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="ck-deliver-title" className="caps font-serif text-[22px] leading-tight font-medium">
            {t("title")}
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed">{line}</p>
          <p className="text-[14px] text-muted">
            <bdi>{name}</bdi> · <bdi dir="ltr" className="figures whitespace-nowrap">{formatKuwaitPhone(phone)}</bdi>
          </p>
        </div>
        <button
          type="button"
          onClick={onChange}
          aria-label={t("changeLabel")}
          className="-me-2 inline-flex min-h-11 shrink-0 items-center px-2 text-[14px] underline decoration-1 underline-offset-4 hover:decoration-2"
        >
          {t("change")}
        </button>
      </div>
    </section>
  );
}
