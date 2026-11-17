"use client";

import { CircleCheck, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { WhatsAppIcon } from "@/components/brand/brand-icons";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/form";
import { Price } from "@/components/ui/price";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/delivery";
import { toLatinDigits } from "@/lib/digits";
import { useLiveSettings } from "@/lib/live";
import { hasImage } from "@/lib/media";
import { whatsappHref } from "@/lib/settings";
import { lookupOrder, type LookupOrderResult } from "@/server/actions/orders";
import type { LookupOrderView } from "@/server/read/order-lookup";
import { iso, PhoneInput } from "./form-helpers";

/** The compact, self-contained receipt — lines + totals + status + date + method. It deliberately does
 * NOT link to /checkout/result (that page is checkout-token-cookie-gated and would 404 cross-device). */
function Receipt({ order }: { order: LookupOrderView }) {
  const t = useTranslations("checkout.orders");
  const locale = useLocale() as Locale;
  return (
    <div className="mt-8 border border-line" data-testid="lookup-result">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-tile px-5 py-4">
        <div className="min-w-0">
          <p className="font-medium">
            <bdi className="figures">{order.id}</bdi>
          </p>
          <p className="text-[13px] text-muted">
            {t("placed", { date: formatDateTime(order.createdAt, locale) })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="caps inline-flex min-h-6 items-center gap-1 border border-racing bg-racing px-2 text-[11px] font-medium text-cream">
            <CircleCheck className="size-3.5" strokeWidth={1.5} aria-hidden />
            {t("statuses.paid")}
          </span>
          <span className="text-[13px] text-muted">{t(`methods.${order.method}`)}</span>
        </div>
      </div>

      <ul className="divide-y divide-line px-5">
        {order.lines.map((line, i) => (
          <li key={`${line.name}-${i}`} className="flex items-center gap-4 py-4">
            {hasImage(line.image) && (
              <div className="relative size-14 shrink-0 bg-tile" aria-hidden>
                <ResponsiveImage image={line.image} alt="" sizes="56px" />
              </div>
            )}
            <div className="min-w-0 flex-1 leading-snug">
              <p className="caps truncate font-serif text-[17px] font-medium">
                <bdi lang="en">{line.name}</bdi>
              </p>
              <p className="figures text-[13px] text-muted">
                <bdi className="whitespace-nowrap">{line.size[locale]}</bdi> · {t("lookup.qty", { qty: line.qty })}
              </p>
            </div>
            <Price fils={line.priceFils * line.qty} className="text-[15px]" />
          </li>
        ))}
      </ul>

      <dl className="space-y-2 border-t border-line px-5 py-4 text-[14px]">
        <div className="flex items-baseline justify-between gap-4">
          <dt>{t("lookup.totals.subtotal")}</dt>
          <dd>
            <Price fils={order.totals.subtotalFils} />
          </dd>
        </div>
        {order.totals.discountFils > 0 && (
          <div className="flex items-baseline justify-between gap-4 text-success">
            <dt>{t("lookup.totals.discount")}</dt>
            <dd>
              −<Price fils={order.totals.discountFils} />
            </dd>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-4">
          <dt>{t("lookup.totals.delivery")}</dt>
          <dd>
            <Price fils={order.totals.deliveryFils} />
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3 text-[17px] font-medium">
          <dt>{t("lookup.totals.total")}</dt>
          <dd>
            <Price fils={order.totals.totalFils} />
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** A generic not-found / throttled notice with the WhatsApp fallback. No existence oracle: the copy is
 * the same whether the id is unknown or the phone is wrong. */
function Notice({
  tone,
  orderId,
}: {
  tone: "notfound" | "throttled";
  orderId: string;
}) {
  const t = useTranslations("checkout.orders");
  const settings = useLiveSettings();
  const id = orderId.trim().slice(0, 40);
  const message = id ? t("lookup.whatsappText", { id: iso(id) }) : t("lookup.whatsappTextNoId");
  return (
    <div className="mt-8 border border-line bg-tile px-5 py-8 text-center" data-testid={`lookup-${tone}`}>
      <p className="caps font-serif text-title-sm font-medium">{t(`lookup.${tone}Title`)}</p>
      <p className="mx-auto mt-3 max-w-md text-[15px] text-muted">{t(`lookup.${tone}Text`)}</p>
      <div className="mt-6">
        <Button asChild variant="secondary">
          <a href={whatsappHref(settings, message)} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon className="size-[18px]" />
            {t("lookup.whatsapp")}
          </a>
        </Button>
      </div>
    </div>
  );
}

/** Guest order lookup: order number + Kuwait mobile → the server action → an inline receipt, a generic
 * not-found, or a "too many attempts" notice. The form stays mounted so a shopper can try again. */
export function OrderLookup() {
  const t = useTranslations("checkout.orders");
  const [number, setNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<LookupOrderResult | null>(null);
  const [lastNumber, setLastNumber] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const submittedNumber = number;
    startTransition(async () => {
      const res = await lookupOrder({ number: submittedNumber, phone });
      setLastNumber(submittedNumber);
      setResult(res);
    });
  };

  return (
    <div className="mx-auto max-w-[560px]">
      <form onSubmit={submit} noValidate className="grid gap-5" data-testid="order-lookup">
        <Field label={t("lookup.numberLabel")}>
          {({ id, invalid }) => (
            <TextInput
              id={id}
              value={number}
              onChange={(e) => setNumber(toLatinDigits(e.target.value).toUpperCase())}
              placeholder={t("lookup.numberPlaceholder")}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              enterKeyHint="next"
              dir="ltr"
              className={cn("figures", invalid && "border-danger")}
            />
          )}
        </Field>
        <Field label={t("lookup.phoneLabel")} hint={t("lookup.phoneHint")}>
          {({ id, describedBy }) => (
            <PhoneInput
              id={id}
              aria-describedby={describedBy}
              value={phone}
              onChange={(e) => setPhone(toLatinDigits(e.target.value))}
              autoComplete="tel-national"
              enterKeyHint="search"
            />
          )}
        </Field>
        <Button type="submit" size="lg" block busy={pending} data-testid="lookup-submit">
          <Search className="size-[18px]" strokeWidth={1.5} aria-hidden />
          {t("lookup.submit")}
        </Button>
      </form>

      {result &&
        (result.ok ? (
          <Receipt order={result.order} />
        ) : (
          <Notice tone={result.reason} orderId={lastNumber} />
        ))}
    </div>
  );
}
