"use client";

import { ArrowRight, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormContext, useWatch } from "react-hook-form";
import { PaymentMarks } from "@/components/brand/brand-icons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/form";
import { Price } from "@/components/ui/price";
import { Link } from "@/i18n/navigation";
import type { CheckoutForm } from "@/lib/validation";
import { anchorId, ChoiceCard, PAY_BUTTON_ID, Section, useFieldError } from "./form-helpers";
import { useCheckoutTotals } from "./order-summary";

export function PaymentSection({ busy }: { busy: boolean }) {
  const t = useTranslations("checkout.payment");
  const { register, control } = useFormContext<CheckoutForm>();
  const method = useWatch({ control, name: "paymentMethod" });
  const { totals } = useCheckoutTotals();
  const termsError = useFieldError("acceptTerms");
  const next = method === "card" ? t("nextCard") : method === "applepay" ? t("nextApplePay") : t("nextKnet");

  const policyLink = (href: string, chunks: React.ReactNode) => (
    <Link href={href} target="_blank" className="underline decoration-1 underline-offset-4 hover:decoration-2">
      {chunks}
      <span className="sr-only"> {t("newTab")}</span>
    </Link>
  );

  return (
    <Section id="ck-payment-title" anchor="payment" title={t("legend")}>
      <div id={anchorId("paymentMethod")} className="grid gap-3">
        <ChoiceCard
          value="knet"
          {...register("paymentMethod")}
          title={t("knet")}
          description={t("knetNote")}
          aside={<PaymentMarks methods={["knet"]} />}
          decorativeAside
        />
        <ChoiceCard
          value="applepay"
          {...register("paymentMethod")}
          title={t("applePay")}
          description={t("applePayNote")}
          aside={<PaymentMarks methods={["applepay"]} />}
          decorativeAside
        />
        <ChoiceCard
          value="card"
          {...register("paymentMethod")}
          title={t("card")}
          description={t("cardNote")}
          aside={<PaymentMarks methods={["visa", "mastercard"]} />}
          decorativeAside
        />
      </div>
      <p className="mt-4 flex items-start gap-2.5 text-[14px] leading-relaxed text-muted">
        <ArrowRight className="mt-1 size-4 shrink-0 rtl:-scale-x-100" strokeWidth={1.25} aria-hidden />
        {next}
      </p>

      <div className="mt-8 space-y-2 border-t border-line pt-6">
        <Checkbox {...register("saveDetails")} label={t("save")} description={t("saveNote")} />
        <div id={anchorId("acceptTerms")} className="scroll-mt-6">
          <Checkbox
            {...register("acceptTerms")}
            aria-invalid={termsError ? true : undefined}
            aria-describedby={termsError ? "ck-terms-error" : undefined}
            label={t.rich("terms", {
              terms: (chunks) => policyLink("/terms", chunks),
              refund: (chunks) => policyLink("/refund-policy", chunks),
            })}
          />
          {termsError && (
            <p id="ck-terms-error" className="ps-[30px] text-[13px] text-danger">
              {termsError}
            </p>
          )}
        </div>
      </div>

      <Button id={PAY_BUTTON_ID} type="submit" size="lg" block busy={busy} className="mt-6" data-testid="checkout-pay">
        {t("pay")} <Price fils={totals.totalFils} />
      </Button>
      <p className="mt-4 flex items-start justify-center gap-2 text-center text-[13px] leading-relaxed text-muted">
        <Lock className="mt-[3px] size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
        {t("secure")}
      </p>
    </Section>
  );
}
