"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { ApplePayLogo } from "@/components/brand/brand-icons";
import { Modal } from "@/components/ui/modal";
import { Price } from "@/components/ui/price";
import { useLiveCatalog, useLiveSettings } from "@/lib/live";
import { formatKuwaitPhone } from "@/lib/phone";
import { computeTotals } from "@/lib/pricing";
import { useBag } from "@/store/bag";
import { useUi } from "@/store/ui";
import { useAddressFormatter } from "./address-format";
import { iso } from "./form-helpers";
import type { OrderDetails } from "./order";
import { TotalsList } from "./order-summary";
import { useInstagramBrowser } from "./use-device";

/*
 * Apple Pay confirm sheet — neutral styling inspired by (not copying) Apple's sheet, clearly labelled
 * "Simulation". For now it routes through the SAME server initiateCheckout → sandbox flow as KNET and
 * card (method "applepay"): confirming hands off to onConfirm, which reprices on the server and
 * redirects to the hosted sandbox page. There is no in-page capture and no card/PIN/OTP input here.
 *
 * Production (Phase 9, gated on domain verification): start an ApplePaySession with merchant
 * validation done by YOUR server (or the provider), send the payment token server-side, and mark the
 * order paid only after the provider confirms it. Instagram's in-app browser has no Apple Pay, so we
 * show "Open in Safari to use Apple Pay" there.
 */

const CARD_LAST4 = "4821";

type Phase = "idle" | "busy";

export function ApplePaySheet({
  open,
  onOpenChange,
  details,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Contact + address shown on the sheet (the form's values). */
  details: OrderDetails;
  /** Reprices on the server and redirects to the sandbox; resolves (without navigating) only on error. */
  onConfirm: () => Promise<void>;
}) {
  const t = useTranslations("checkout.applePay");
  const te = useTranslations("checkout.express");
  const announce = useUi((s) => s.announce);
  const format = useAddressFormatter();
  const inInstagram = useInstagramBrowser();
  const lines = useBag((s) => s.lines);
  const promo = useBag((s) => s.promo);
  const catalog = useLiveCatalog();
  const settings = useLiveSettings();
  const [phase, setPhase] = useState<Phase>("idle");

  const totals = computeTotals({ lines, promo, deliveryMethod: details.deliveryMethod, catalog, settings });
  const address = format(details);

  const confirm = async () => {
    if (phase !== "idle") return;
    setPhase("busy");
    announce(t("processing"));
    await onConfirm();
    // Success navigates to the sandbox (this code never runs). If we are still here, initiate failed —
    // the caller already surfaced the error, so just reopen the sheet for another try.
    setPhase("idle");
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        // Once confirmed, the payment is on its way: the sheet can't be dismissed.
        if (!next && phase !== "idle") return;
        onOpenChange(next);
      }}
      title={`${t("dialogTitle")} — ${t("simulation")}`}
      hideTitle
      className="sm:max-w-[440px]"
    >
      <div className="px-5 pt-4 pb-6 sm:px-7 sm:pt-6 sm:pb-7">
        <div className="flex items-center gap-3 pe-12">
          <ApplePayLogo className="h-11" label="Apple Pay" />
          <span className="caps border border-ink/25 px-2 text-[11px] leading-5 text-muted">{t("simulation")}</span>
        </div>

        {inInstagram && <p className="mt-3 bg-tile px-3 py-2.5 text-[13px] leading-snug">{te("instagramHint")}</p>}

        <dl className="mt-4 divide-y divide-line border-y border-line text-[14px] leading-snug">
          <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-4 py-3.5">
            <dt className="caps pt-0.5 text-[12px] text-muted">{t("card")}</dt>
            <dd className="flex items-center gap-3">
              <span aria-hidden className="inline-flex h-6 w-9 shrink-0 items-end justify-end bg-racing p-[3px]">
                <span className="text-[6px] leading-none font-semibold text-cream">KNET</span>
              </span>
              <span>
                {t("cardValue")}{" "}
                <bdi dir="ltr" className="figures whitespace-nowrap">
                  •••• {CARD_LAST4}
                </bdi>
              </span>
            </dd>
          </div>
          <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-4 py-3.5">
            <dt className="caps pt-0.5 text-[12px] text-muted">{t("shipTo")}</dt>
            <dd className="space-y-0.5">
              <p className="font-medium">
                <bdi>{details.name}</bdi>
              </p>
              {address.street && <p>{address.street}</p>}
              {address.building && <p>{address.building}</p>}
              <p className="text-muted">
                {address.areaLine} · {address.country}
              </p>
            </dd>
          </div>
          <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-4 py-3.5">
            <dt className="caps pt-0.5 text-[12px] text-muted">{t("delivery")}</dt>
            <dd className="flex flex-wrap items-baseline justify-end gap-x-3">
              <Price fils={totals.deliveryFils} />
            </dd>
          </div>
          <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-4 py-3.5">
            <dt className="caps pt-0.5 text-[12px] text-muted">{t("contact")}</dt>
            <dd className="space-y-0.5">
              <p>
                <bdi dir="ltr" className="figures whitespace-nowrap">
                  {formatKuwaitPhone(details.phone)}
                </bdi>
              </p>
              {details.email && (
                <p className="truncate text-muted">
                  <bdi dir="ltr">{details.email}</bdi>
                </p>
              )}
            </dd>
          </div>
        </dl>

        <TotalsList
          totals={totals}
          promoCode={promo?.code ?? null}
          totalLabel={t("payTo", { merchant: iso("MYSTIC SAND") })}
          className="mt-4"
        />

        <button
          type="button"
          onClick={confirm}
          aria-busy={phase !== "idle" || undefined}
          className="mt-6 flex h-14 w-full items-center justify-center gap-3 bg-ink text-[15px] text-paper transition-opacity hover:opacity-90 aria-busy:cursor-progress"
          data-testid="applepay-confirm"
        >
          {phase === "idle" ? (
            <>
              <SideButtonGlyph />
              {t("confirm")}
            </>
          ) : (
            <>
              <span
                aria-hidden
                className="size-5 animate-spin-slow rounded-full border-2 border-paper border-t-transparent"
              />
              {t("processing")}
            </>
          )}
        </button>
        <p className="mt-3 text-center text-[12px] leading-relaxed text-muted">{t("terms")}</p>
      </div>
    </Modal>
  );
}

/** A phone outline with its side button highlighted (physical, so never mirrored). */
function SideButtonGlyph() {
  return (
    <svg viewBox="0 0 20 28" className="h-6 w-auto" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.25">
      <rect x="2" y="1.5" width="13" height="25" />
      <path d="M18 6.5v6" strokeWidth="2.5" strokeLinecap="square" />
    </svg>
  );
}
