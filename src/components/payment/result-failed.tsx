"use client";

import { CircleAlert, CircleSlash, Hourglass, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { WhatsAppIcon } from "@/components/brand/brand-icons";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { Link, useRouter } from "@/i18n/navigation";
import { clampBagToStock, orderExceedsStock } from "@/lib/capture";
import { cn } from "@/lib/cn";
import { useLiveSettings } from "@/lib/live";
import { mockGateway } from "@/lib/payments/mock";
import { whatsappHref } from "@/lib/settings";
import type { PaymentRecord } from "@/lib/payments/types";
import type { Order } from "@/store/checkout";
import { useUi } from "@/store/ui";
import { isolate } from "./format";
import { PaymentDetails } from "./payment-details";
import { useFocusOnMount } from "./use-focus-on-mount";

/**
 * NOT CAPTURED (declined, styled as an error) or CANCELED (neutral). Nothing was
 * charged and the bag is untouched, so retrying is one tap: same order, new attempt.
 */
export function ResultFailed({
  order,
  attempt,
  reason,
}: {
  order: Order;
  attempt?: PaymentRecord;
  reason: "timeout" | null;
}) {
  const t = useTranslations("payment");
  const tc = useTranslations("common");
  const router = useRouter();
  const settings = useLiveSettings();
  const pushToast = useUi((s) => s.pushToast);
  const [busy, setBusy] = useState(false);
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const declined = attempt?.result === "NOT CAPTURED";
  const timedOut = !declined && reason === "timeout";
  const retryMethod = order.method === "card" ? "card" : "knet";

  const message = !attempt
    ? t("failed.awaiting")
    : declined
      ? t("failed.declined")
      : timedOut
        ? t("failed.timeout")
        : t("failed.canceled");

  const retry = () => {
    setBusy(true);
    // "Try again" reuses the stored order — re-check stock before reopening the gateway, so a
    // size that sold out (or was lowered) since the failed attempt can never be captured now.
    if (orderExceedsStock(order)) {
      clampBagToStock();
      pushToast({ title: tc("stockRefused") });
      router.push("/cart");
      return;
    }
    const { redirectPath } = mockGateway.initiate({
      orderId: order.id,
      method: retryMethod,
      amountFils: order.totals.totalFils,
    });
    router.push(redirectPath);
  };

  const iconClass = cn("mx-auto size-12", declined ? "text-danger" : "text-muted");
  return (
    <div
      className="mx-auto max-w-[640px] px-4 py-12 md:py-20"
      data-testid="result-failed"
      data-result={attempt?.result ?? "NONE"}
    >
      <div className="text-center">
        {declined ? (
          <CircleAlert className={iconClass} strokeWidth={1} aria-hidden />
        ) : timedOut ? (
          <Hourglass className={iconClass} strokeWidth={1} aria-hidden />
        ) : (
          <CircleSlash className={iconClass} strokeWidth={1} aria-hidden />
        )}
        <h1
          ref={heading}
          tabIndex={-1}
          className="caps mt-6 font-serif text-title-sm font-medium outline-none md:text-title"
        >
          {t("failed.title")}
        </h1>
        <p className={cn("mt-3 text-[17px]", declined && "text-danger")}>{message}</p>
        <p className="mt-2 text-[15px] text-muted">
          {t.rich("failed.order", {
            id: order.id,
            bdi: (chunks) => <bdi className="figures">{chunks}</bdi>,
          })}{" "}
          · <Price fils={order.totals.totalFils} />
        </p>
      </div>

      <div className="mt-8 flex items-start gap-3 border border-line bg-tile p-5 text-[15px] leading-relaxed">
        <ShieldCheck className="mt-1 size-5 shrink-0 text-racing" strokeWidth={1.25} aria-hidden />
        <p>{t("failed.reassurance")}</p>
      </div>

      <div className="mt-8 grid gap-3">
        <Button size="lg" block busy={busy} onClick={retry} data-testid="retry-payment">
          {retryMethod === "card" ? t("failed.retryCard") : t("failed.retryKnet")}
        </Button>
        <Button asChild size="lg" variant="secondary" block>
          <Link href="/checkout#payment">{t("failed.otherMethod")}</Link>
        </Button>
      </div>

      {attempt && <PaymentDetails attempt={attempt} compact className="mt-12" />}

      <p className="mt-8 text-center">
        <a
          href={whatsappHref(settings, t("failed.helpText", { id: isolate(order.id) }))}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 text-[14px] underline underline-offset-4 hover:decoration-2"
        >
          <WhatsAppIcon className="size-4" />
          {t("failed.help")}
        </a>
      </p>
    </div>
  );
}
