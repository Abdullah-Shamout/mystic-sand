"use client";

import { useTranslations } from "next-intl";
import { useFormContext } from "react-hook-form";
import { TextInput } from "@/components/ui/form";
import type { CheckoutForm } from "@/lib/validation";
import { CheckoutField, PhoneInput, Section, withLatinDigits } from "./form-helpers";

export function ContactSection() {
  const t = useTranslations("checkout.contact");
  const { register } = useFormContext<CheckoutForm>();
  return (
    <Section id="ck-contact-title" title={t("legend")}>
      <div className="grid gap-5 sm:grid-cols-2 sm:gap-x-4">
        <CheckoutField name="name" label={t("name")} className="sm:col-span-2">
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              autoComplete="name"
              autoCapitalize="words"
              enterKeyHint="next"
              {...register("name")}
            />
          )}
        </CheckoutField>
        <CheckoutField name="phone" label={t("phone")} hint={t("phoneHint")}>
          {({ id, describedBy, invalid }) => (
            <PhoneInput
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              autoComplete="tel-national"
              enterKeyHint="next"
              {...withLatinDigits(register("phone"))}
            />
          )}
        </CheckoutField>
        <CheckoutField name="email" label={t("email")} optional hint={t("emailHint")}>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              type="email"
              inputMode="email"
              dir="ltr"
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              autoComplete="email"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="next"
              className="text-start rtl:text-end"
              {...register("email")}
            />
          )}
        </CheckoutField>
      </div>
    </Section>
  );
}
