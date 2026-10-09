"use client";

import { useTranslations } from "next-intl";
import { Logo } from "@/components/brand/logo";
import { WhatsAppIcon } from "@/components/brand/brand-icons";
import { Button } from "@/components/ui/button";
import { whatsappLink } from "@/data/site";
import { Link } from "@/i18n/navigation";
import { isolate } from "./format";
import { useFocusOnMount } from "./use-focus-on-mount";

/** Orders live in this browser's storage: a link opened elsewhere can't show them. */
export function OrderNotFound({ orderId }: { orderId: string }) {
  const t = useTranslations("payment.notFound");
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const id = orderId.trim().slice(0, 40);
  const message = id ? t("whatsappText", { id: isolate(id) }) : t("whatsappTextNoId");

  return (
    <div className="mx-auto max-w-[600px] px-4 py-16 text-center md:py-24" data-testid="order-not-found">
      <span aria-hidden className="flex justify-center">
        <Logo variant="mark" className="h-14 w-auto text-sand" title="" />
      </span>
      <h1
        ref={heading}
        tabIndex={-1}
        className="caps mt-8 font-serif text-title-sm font-medium outline-none md:text-title"
      >
        {t("title")}
      </h1>
      {id && (
        <p className="mt-5 text-[15px]">
          {t("order")}: <bdi className="figures font-medium">{id}</bdi>
        </p>
      )}
      <p className="mx-auto mt-3 max-w-md text-[15px] text-muted">{id ? t("text") : t("textNoId")}</p>
      <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button asChild>
          <a href={whatsappLink(message)} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon className="size-[18px]" />
            {t("whatsapp")}
          </a>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/shop">{t("shop")}</Link>
        </Button>
      </div>
    </div>
  );
}
