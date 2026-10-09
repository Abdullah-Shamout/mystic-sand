"use client";

import { createTranslator } from "next-intl";
import { Logo } from "@/components/brand/logo";
import { banks } from "@/data/banks";
import { areaById, governorates } from "@/data/kuwait-areas";
import { delivery, site } from "@/data/site";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/delivery";
import { useLiveSettings } from "@/lib/live";
import { formatAmount } from "@/lib/money";
import type { PaymentRecord } from "@/lib/payments/types";
import { formatKuwaitPhone } from "@/lib/phone";
import { phoneDisplay } from "@/lib/settings";
import type { Order } from "@/store/checkout";
import arMessages from "../../../messages/ar/payment.json";
import enMessages from "../../../messages/en/payment.json";
import { addressParts, AddressParts, type AddressLabels } from "./address";

// The invoice is bilingual whatever the page language — Arabic first, as Kuwaiti
// rules expect invoices in Arabic — so it formats from both message files directly.
const tAr = createTranslator({ locale: "ar", messages: { payment: arMessages }, namespace: "payment", timeZone: "Asia/Kuwait" });
const tEn = createTranslator({ locale: "en", messages: { payment: enMessages }, namespace: "payment", timeZone: "Asia/Kuwait" });

type Key = Parameters<typeof tEn>[0];

const ADDRESS_KEYS = ["block", "street", "avenue", "house", "building", "floor", "apartment", "office"] as const;
const addressLabels = (t: typeof tAr | typeof tEn) =>
  Object.fromEntries(ADDRESS_KEYS.map((k) => [k, t(`delivery.${k}`)])) as AddressLabels;

/** Arabic label with its English translation underneath (or after it, `inline`). */
function Bi({ k, inline, className }: { k: Key; inline?: boolean; className?: string }) {
  return (
    <span className={cn("block leading-tight", className)}>
      <span className={inline ? undefined : "block"}>{tAr(k)}</span>
      {inline && " "}
      <span className={cn("text-[10px] font-normal text-muted", !inline && "block")}>
        <bdi lang="en">{tEn(k)}</bdi>
      </span>
    </span>
  );
}

/** An English line under Arabic text: the block span keeps the Arabic (right) alignment, the bdi isolates it. */
function En({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("block", className)}>
      <bdi lang="en">{children}</bdi>
    </span>
  );
}

function Field({ k, className, children }: { k: Key; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 border-b border-line py-1", className)}>
      <dt className="text-[11px] font-medium">
        <Bi k={k} />
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function Total({ k, note, strong, children }: { k: Key; note?: string | null; strong?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-6 py-0.5",
        strong && "mt-1.5 border-t-2 border-ink pt-1.5 text-[14px] font-medium",
      )}
    >
      <dt>
        <Bi k={k} inline />
        {note && (
          <span className="block text-[10px] text-muted">
            <bdi>{note}</bdi>
          </span>
        )}
      </dt>
      <dd className="text-end">{children}</dd>
    </div>
  );
}

const amount = (fils: number) => <bdi className="figures">{formatAmount(fils)}</bdi>;
const code = (value: string | undefined) => <bdi className="figures">{value || "—"}</bdi>;

/**
 * Bilingual invoice: seller identity, order, items, delivery, total and the KNET reference
 * fields. `variant` is "print" (hidden on screen, shown only when printing — the storefront
 * receipt) or "document" (rendered as a visible block, for off-screen PDF capture in the admin).
 * The font comes from --ms-sans-ar so Arabic renders with the web font on English pages too.
 * TODO(client): trade name and CR in site.ts.
 */
export function Invoice({
  order,
  attempt,
  variant = "print",
}: {
  order: Order;
  attempt: PaymentRecord;
  variant?: "print" | "document";
}) {
  const settings = useLiveSettings();
  const d = order.details;
  const area = areaById(d.areaId);
  const bank = attempt.bankId ? banks.find((b) => b.id === attempt.bankId) : undefined;
  const crNumber = site.trade.cr.replace(/\D/g, "") || site.trade.cr;
  const [streetAr, unitAr] = addressParts(d, addressLabels(tAr));
  const [streetEn, unitEn] = addressParts(d, addressLabels(tEn));
  const days = { days: delivery.returnsDays, daysText: String(delivery.returnsDays) };
  const { totals } = order;

  return (
    <section
      dir="rtl"
      lang="ar"
      style={{ fontFamily: "var(--ms-sans-ar)" }}
      className={cn("text-[12px] leading-relaxed text-ink", variant === "print" ? "hidden print:block" : "block")}
    >
      <div className="flex items-start justify-between gap-8 border-b-2 border-ink pb-4">
        <div>
          <p className="text-[16px] font-medium">{site.trade.name.ar}</p>
          <p>
            <bdi lang="en">{site.trade.name.en}</bdi>
          </p>
          <p className="mt-1 text-muted">
            {tAr("invoice.cr")}: <bdi className="figures">{crNumber}</bdi>
          </p>
          <En className="text-muted">
            {tEn("invoice.cr")}: {crNumber}
          </En>
          <p className="text-muted">
            <bdi dir="ltr" className="figures">
              {phoneDisplay(settings)}
            </bdi>{" "}
            · <bdi>{site.email}</bdi>
          </p>
        </div>
        <div className="flex flex-col items-end text-end">
          <Logo variant="full" className="h-12 w-auto" title={site.brand} />
          <Bi k="invoice.title" className="mt-2 text-[18px] font-medium" />
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted">
        {tAr("invoice.demo")} · <bdi lang="en">{tEn("invoice.demo")}</bdi>
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-x-10">
        <Field k="invoice.orderNo">
          <bdi className="figures font-medium">{order.id}</bdi>
        </Field>
        <Field k="invoice.date">
          <span className="block">{formatDateTime(attempt.at, "ar")}</span>
          <En className="text-muted">{formatDateTime(attempt.at, "en")}</En>
        </Field>
        <Field k="invoice.customer">
          <span className="block">
            <bdi>{d.name}</bdi>
          </span>
          <span className="block">
            <bdi dir="ltr" className="figures">
              {formatKuwaitPhone(d.phone)}
            </bdi>
          </span>
        </Field>
        <Field k="invoice.deliveryMethod">
          {tAr(`delivery.${d.deliveryMethod}`)}
          <En className="text-muted">{tEn(`delivery.${d.deliveryMethod}`)}</En>
        </Field>
        <Field k="invoice.address" className="col-span-2">
          {area && (
            <span className="block">
              {area.name.ar}، {governorates[area.governorate].ar} ·{" "}
              <bdi lang="en">
                {area.name.en}, {governorates[area.governorate].en}
              </bdi>
            </span>
          )}
          <span className="block">
            <AddressParts parts={[...streetAr, ...unitAr]} separator="، " />
          </span>
          <En className="text-muted">
            <AddressParts parts={[...streetEn, ...unitEn]} separator=", " />
          </En>
        </Field>
      </dl>

      <table className="mt-5 w-full border-collapse">
        <thead>
          <tr className="border-y border-ink align-bottom">
            <th scope="col" className="py-2 pe-3 text-start font-medium">
              <Bi k="invoice.item" />
            </th>
            <th scope="col" className="w-16 py-2 text-center font-medium">
              <Bi k="invoice.qty" />
            </th>
            <th scope="col" className="w-28 py-2 text-end font-medium">
              <Bi k="invoice.unitPrice" />
            </th>
            <th scope="col" className="w-28 py-2 text-end font-medium">
              <Bi k="invoice.amount" />
            </th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map((line) => (
            <tr key={line.sku} className="break-inside-avoid border-b border-line align-top">
              <td className="py-2 pe-3">
                <bdi lang="en" className="font-medium">
                  {line.name}
                </bdi>{" "}
                · {line.size.ar}{" "}
                <span className="text-muted">
                  / <bdi lang="en">{line.size.en}</bdi>
                </span>
                <span className="block text-[10px] text-muted">
                  <bdi>{line.sku}</bdi>
                </span>
              </td>
              <td className="py-2 text-center">
                <bdi className="figures">{line.qty}</bdi>
              </td>
              <td className="py-2 text-end">{amount(line.priceFils)}</td>
              <td className="py-2 text-end">{amount(line.priceFils * line.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ms-auto mt-4 w-[55%] break-inside-avoid">
        <Total k="invoice.subtotal">{amount(totals.subtotalFils)}</Total>
        {totals.discountFils > 0 && (
          <Total k="invoice.discount" note={order.promoCode}>
            {/* One isolated LTR run, so the minus stays in front of the figure. */}
            <bdi dir="ltr" className="figures">
              −{formatAmount(totals.discountFils)}
            </bdi>
          </Total>
        )}
        <Total k="invoice.delivery">{amount(totals.deliveryFils)}</Total>
        <Total k="invoice.total" strong>
          {amount(totals.totalFils)}
        </Total>
      </dl>
      <p className="mt-1 text-end text-[10px] text-muted">
        {tAr("invoice.currency")} · <bdi lang="en">{tEn("invoice.currency")}</bdi>
      </p>

      <div className="mt-6 break-inside-avoid">
        <h2 className="border-b border-ink pb-1.5 text-[12px] font-medium">
          <Bi k="invoice.payment" />
        </h2>
        <dl className="grid grid-cols-2 gap-x-10">
          <Field k="fields.method">
            {tAr(`methods.${attempt.method}`)}
            {bank && ` · ${bank.name.ar}`}
            <En className="text-muted">
              {tEn(`methods.${attempt.method}`)}
              {bank && ` · ${bank.name.en}`}
            </En>
          </Field>
          <Field k="fields.result">
            <bdi lang="en">{attempt.result}</bdi>
          </Field>
          <Field k="fields.paymentId">{code(attempt.paymentId)}</Field>
          <Field k="fields.tranId">{code(attempt.tranId)}</Field>
          <Field k="fields.ref">{code(attempt.ref)}</Field>
          <Field k="fields.auth">{code(attempt.auth)}</Field>
          <Field k="fields.postDate">{code(attempt.postDate)}</Field>
          <Field k="fields.trackId">{code(attempt.trackId)}</Field>
        </dl>
      </div>

      <p className="mt-6 border-t border-line pt-3 text-center text-[11px]">
        {tAr("invoice.footer", days)}
        <En className="text-muted">{tEn("invoice.footer", days)}</En>
      </p>
    </section>
  );
}
