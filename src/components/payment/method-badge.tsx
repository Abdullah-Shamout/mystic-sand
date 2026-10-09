"use client";

import { useTranslations } from "next-intl";
import { PaymentMarks } from "@/components/brand/brand-icons";

export type GatewayMethod = "knet" | "card";

/**
 * KNET is a plain text badge (no KNET artwork or page design is imitated);
 * cards show the Visa and Mastercard marks.
 */
export function MethodBadge({ method }: { method: GatewayMethod }) {
  const t = useTranslations("payment.gateway");
  return (
    <span className="inline-flex items-center">
      <span className="sr-only">{method === "knet" ? t("methodKnet") : t("methodCard")}</span>
      {method === "knet" ? (
        <span
          aria-hidden
          lang="en"
          className="inline-flex h-7 items-center border border-ink px-2.5 text-[11px] leading-none font-semibold"
        >
          KNET
        </span>
      ) : (
        <span aria-hidden>
          <PaymentMarks methods={["visa", "mastercard"]} />
        </span>
      )}
    </span>
  );
}
