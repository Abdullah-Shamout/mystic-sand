"use client";

import { useLocale, useTranslations } from "next-intl";
import { Price } from "@/components/ui/price";
import { areaById, governorates } from "@/data/kuwait-areas";
import type { Locale } from "@/i18n/routing";
import { formatKuwaitPhone } from "@/lib/phone";
import type { Order } from "@/store/checkout";
import { addressParts, AddressParts, type AddressLabels } from "./address";

const ADDRESS_KEYS = ["block", "street", "avenue", "house", "building", "floor", "apartment", "office"] as const;

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="caps text-[13px] font-normal text-muted">{children}</h3>;
}

/** Delivery address, method and gift details of a placed order. */
export function DeliveryDetails({ order }: { order: Order }) {
  const t = useTranslations("payment");
  const locale = useLocale() as Locale;
  const d = order.details;
  const area = areaById(d.areaId);
  const separator = locale === "ar" ? "، " : ", ";
  const labels = Object.fromEntries(ADDRESS_KEYS.map((k) => [k, t(`delivery.${k}`)])) as AddressLabels;
  const [streetLine, unitLine] = addressParts(d, labels);
  const mapsLink = /^https:\/\//i.test(d.mapsLink.trim()) ? d.mapsLink.trim() : null;
  const gift = d.giftEnabled && Boolean(d.giftRecipient || d.giftPhone || d.giftMessage);

  return (
    <section aria-labelledby="delivery-title">
      <h2 id="delivery-title" className="caps font-serif text-title-sm font-medium">
        {t("delivery.title")}
      </h2>
      <div className="mt-5 grid gap-8 border-t border-line pt-6 sm:grid-cols-2">
        <div>
          <Heading>{t("delivery.address")}</Heading>
          <div className="mt-2 text-[15px] leading-relaxed">
            <p className="font-medium">
              <bdi>{d.name}</bdi>
            </p>
            <p>
              <bdi dir="ltr" className="figures">
                {formatKuwaitPhone(d.phone)}
              </bdi>
            </p>
            {area && (
              <p>
                {area.name[locale]}
                {separator}
                {governorates[area.governorate][locale]}
              </p>
            )}
            {streetLine.length > 0 && (
              <p>
                <AddressParts parts={streetLine} separator={separator} />
              </p>
            )}
            {unitLine.length > 0 && (
              <p>
                <AddressParts parts={unitLine} separator={separator} />
              </p>
            )}
            {mapsLink && (
              <a
                href={mapsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex min-h-11 items-center text-[14px] underline underline-offset-4"
              >
                {t("delivery.map")}
              </a>
            )}
            {d.notes && (
              <p className="mt-2 text-[14px] text-muted">
                {t("delivery.notes")}: <span dir="auto">{d.notes}</span>
              </p>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <Heading>{t("delivery.method")}</Heading>
            <p className="mt-2 text-[15px]">
              {d.deliveryMethod === "express" ? t("delivery.express") : t("delivery.standard")} ·{" "}
              <Price fils={order.totals.deliveryFils} free />
            </p>
          </div>

          {(gift || order.giftWrap) && (
            <div>
              <Heading>{t("gift.title")}</Heading>
              <div className="mt-2 space-y-1 text-[15px] leading-relaxed">
                {order.giftWrap && (
                  <p>
                    {t("gift.wrap")} · <Price fils={order.totals.giftWrapFils} free />
                  </p>
                )}
                {gift && d.giftRecipient && (
                  <p>
                    <span className="text-muted">{t("gift.to")}:</span> <bdi>{d.giftRecipient}</bdi>
                  </p>
                )}
                {gift && d.giftPhone && (
                  <p>
                    <span className="text-muted">{t("gift.phone")}:</span>{" "}
                    <bdi dir="ltr" className="figures">
                      {formatKuwaitPhone(d.giftPhone)}
                    </bdi>
                  </p>
                )}
                {gift && d.giftMessage && (
                  <figure className="mt-3">
                    <figcaption className="text-[13px] text-muted">{t("gift.message")}</figcaption>
                    <blockquote dir="auto" className="mt-1 border-s-2 border-sand ps-4 font-serif text-[18px] leading-snug whitespace-pre-line">
                      {d.giftMessage}
                    </blockquote>
                  </figure>
                )}
                {gift && d.hidePrices && <p className="pt-1 text-[13px] text-muted">{t("gift.hidePrices")}</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
