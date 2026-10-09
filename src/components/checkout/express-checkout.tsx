"use client";

import { useTranslations } from "next-intl";
import { ApplePayLogo } from "@/components/brand/brand-icons";
import { useInstagramBrowser } from "./use-device";

/** Express checkout above the form: one tap to the Apple Pay sheet. */
export function ExpressCheckout({ onApplePay }: { onApplePay: () => void }) {
  const t = useTranslations("checkout.express");
  const inInstagram = useInstagramBrowser();
  return (
    <section aria-labelledby="ck-express-title" className="mt-8">
      <h2 id="ck-express-title" className="caps text-center text-[13px] text-muted">
        {t("title")}
      </h2>
      <button
        type="button"
        onClick={onApplePay}
        aria-label={t("applePay")}
        className="mt-3 flex h-[52px] w-full items-center justify-center bg-ink text-paper transition-opacity hover:opacity-85"
        data-testid="express-applepay"
      >
        <ApplePayLogo className="h-11" label="" />
      </button>
      {inInstagram && <p className="mt-2 text-center text-[13px] text-muted">{t("instagramHint")}</p>}
      <p className="mt-8 flex items-center gap-4 text-[13px] text-muted">
        <span aria-hidden className="h-px flex-1 bg-line" />
        {t("or")}
        <span aria-hidden className="h-px flex-1 bg-line" />
      </p>
    </section>
  );
}
