"use client";

import { Copy } from "lucide-react";
import { createTranslator, useLocale, useTranslations } from "next-intl";
import { WhatsAppIcon } from "@/components/brand/brand-icons";
import { DeliveryDetails } from "@/components/payment/delivery-details";
import { OrderSummary } from "@/components/payment/order-summary";
import { PaymentDetails } from "@/components/payment/payment-details";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import type { Locale } from "@/i18n/routing";
import { statusKind, type AdminOrder } from "@/lib/admin/orders";
import { formatDateTime } from "@/lib/delivery";
import { formatKWD } from "@/lib/money";
import { formatKuwaitPhone } from "@/lib/phone";
import { useUi } from "@/store/ui";
import { SampleTag, StatusChip } from "../status-chip";
import { ReceiptActions } from "./receipt-capture";
import { useFulfillment } from "./use-fulfillment";
import arAdmin from "../../../../messages/ar/admin.json";
import enAdmin from "../../../../messages/en/admin.json";

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** wa.me link with a greeting in the ORDER's language (not the admin UI language). */
function whatsappHref(order: AdminOrder["order"]): string {
  const messages = order.locale === "ar" ? arAdmin : enAdmin;
  const t = createTranslator({ locale: order.locale, messages: { admin: messages }, namespace: "admin" });
  const text = t("orders.whatsapp", {
    name: firstName(order.details.name),
    id: order.id,
    total: formatKWD(order.totals.totalFils, order.locale),
  });
  return `https://wa.me/965${order.details.phone}?text=${encodeURIComponent(text)}`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-[14px]">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-end">{children}</dd>
    </div>
  );
}

function Body({ item }: { item: AdminOrder }) {
  const t = useTranslations("admin");
  const locale = useLocale() as Locale;
  const { order } = item;

  return (
    <div className="space-y-10 px-6 py-6">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip kind={statusKind(item)} />
        {item.source === "sample" && <SampleTag />}
      </div>

      <dl className="divide-y divide-line border-y border-line">
        <Row label={t("orders.drawer.placed")}>
          <bdi>{formatDateTime(item.placedAt, locale)}</bdi>
        </Row>
        {item.doneAt && (
          <Row label={t("orders.drawer.done")}>
            <bdi>{formatDateTime(item.doneAt, locale)}</bdi>
          </Row>
        )}
        <Row label={t("orders.drawer.customer")}>
          <bdi>{order.details.name}</bdi>
        </Row>
        <Row label={t("orders.drawer.phone")}>
          <bdi dir="ltr" className="figures">
            {formatKuwaitPhone(order.details.phone)}
          </bdi>
        </Row>
        <Row label={t("orders.drawer.email")}>
          {order.details.email ? <bdi dir="ltr">{order.details.email}</bdi> : <span className="text-muted">{t("orders.drawer.noEmail")}</span>}
        </Row>
        <Row label={t("orders.drawer.language")}>
          {order.locale === "ar" ? t("orders.drawer.langAr") : t("orders.drawer.langEn")}
        </Row>
      </dl>

      <OrderSummary order={order} />
      <DeliveryDetails order={order} />

      <section>
        <h3 className="caps text-[13px] font-normal text-muted">{t("orders.drawer.notes")}</h3>
        <p className="mt-2 text-[14px] leading-relaxed" dir="auto">
          {order.details.notes || <span className="text-muted">{t("orders.drawer.noNotes")}</span>}
        </p>
      </section>

      {item.receiptAttempt && <PaymentDetails attempt={item.receiptAttempt} />}
    </div>
  );
}

function Footer({ item }: { item: AdminOrder }) {
  const t = useTranslations("admin");
  const pushToast = useUi((s) => s.pushToast);
  const fulfill = useFulfillment();
  const { order } = item;
  const isDone = item.fulfillment === "done";
  const canMarkDone = order.status === "paid";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(order.id);
      pushToast({ title: t("orders.drawer.copied") });
    } catch {
      // clipboard blocked
    }
  };

  return (
    <div className="space-y-2 px-6 py-4">
      <div className="flex flex-wrap gap-2">
        {isDone ? (
          <Button variant="secondary" size="sm" onClick={() => fulfill.markPending(order.id)}>
            {t("orders.markPending")}
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => fulfill.markDone(order.id)}
            disabled={!canMarkDone}
            title={canMarkDone ? undefined : t("orders.cannotMarkDone")}
          >
            {t("orders.markDone")}
          </Button>
        )}
        <ReceiptActions order={order} attempt={item.receiptAttempt} />
        <Button asChild variant="secondary" size="sm">
          <a href={whatsappHref(order)} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon className="size-4" />
            {t("orders.drawer.whatsapp")}
          </a>
        </Button>
        <Button variant="ghost" size="sm" onClick={copy}>
          <Copy className="size-4" strokeWidth={1.5} aria-hidden />
          {t("orders.drawer.copyNumber")}
        </Button>
      </div>
      {!isDone && !canMarkDone && <p className="text-[12px] text-muted">{t("orders.cannotMarkDone")}</p>}
      {!item.receiptAttempt && <p className="text-[12px] text-muted">{t("orders.drawer.noReceipt")}</p>}
    </div>
  );
}

export function OrderDrawer({ item, onClose }: { item: AdminOrder | null; onClose: () => void }) {
  const t = useTranslations("admin");
  return (
    <Drawer
      open={Boolean(item)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={item ? t("orders.drawer.title", { id: item.order.id }) : ""}
      width="max-w-[760px]"
      footer={item ? <Footer item={item} /> : undefined}
    >
      {item && <Body item={item} />}
    </Drawer>
  );
}
