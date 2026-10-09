"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Checkbox, TextArea, TextInput } from "@/components/ui/form";
import { giftWrap as giftWrapConfig } from "@/data/site";
import type { CheckoutForm } from "@/lib/validation";
import { useBag } from "@/store/bag";
import { anchorId, CheckoutField, PhoneInput, Section, withLatinDigits } from "./form-helpers";

const OCCASIONS = ["eid", "ramadan", "birthday", "congrats", "thanks"] as const;

function GiftMessage() {
  const t = useTranslations("checkout.gift");
  const { register, control, getValues, setValue } = useFormContext<CheckoutForm>();
  const message = useWatch({ control, name: "giftMessage" }) ?? "";
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const max = giftWrapConfig.messageMax;
  const { ref: registerRef, ...field } = register("giftMessage");

  // Occasion chips add a greeting to the message (in the language of the page).
  const insert = (phrase: string) => {
    const current = getValues("giftMessage");
    const next = current.includes(phrase)
      ? current
      : (current.trim() ? `${current.trimEnd()}\n${phrase}` : phrase).slice(0, max);
    setValue("giftMessage", next, { shouldDirty: true, shouldValidate: true });
    const el = textarea.current;
    if (el) {
      el.focus();
      el.setSelectionRange(next.length, next.length);
    }
  };

  return (
    <div className="space-y-3">
      <div role="group" aria-labelledby="ck-occasions">
        <p id="ck-occasions" className="text-[14px]">
          {t("occasions")}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {OCCASIONS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => insert(t(key))}
              aria-label={t("insert", { text: t(key) })}
              className="min-h-11 border border-ink/20 bg-paper px-4 text-[14px] transition-colors hover:border-ink"
            >
              {t(key)}
            </button>
          ))}
        </div>
      </div>
      <CheckoutField name="giftMessage" label={t("message")} optional>
        {({ id, describedBy, invalid }) => (
          <>
            <TextArea
              id={id}
              dir="auto"
              rows={4}
              maxLength={max}
              placeholder={t("messagePlaceholder")}
              aria-describedby={[describedBy, "ck-gift-counter"].filter(Boolean).join(" ")}
              aria-invalid={invalid || undefined}
              {...field}
              ref={(el) => {
                registerRef(el);
                textarea.current = el;
              }}
            />
            <p id="ck-gift-counter" className="figures text-end text-[12px] text-muted">
              {t("counter", { count: message.length, max })}
            </p>
          </>
        )}
      </CheckoutField>
    </div>
  );
}

export function GiftSection() {
  const t = useTranslations("checkout.gift");
  const { register, control, getValues, setValue } = useFormContext<CheckoutForm>();
  const giftEnabled = useWatch({ control, name: "giftEnabled" });
  const giftWrap = useBag((s) => s.giftWrap);
  const setGiftWrap = useBag((s) => s.setGiftWrap);

  // Gift wrap ticked in the bag drawer opens the gift options here too.
  useEffect(() => {
    if (giftWrap && !getValues("giftEnabled")) setValue("giftEnabled", true, { shouldDirty: true });
  }, [giftWrap, getValues, setValue]);

  // Wrapping is complimentary, so turning the gift on wraps it; turning it off unwraps it.
  const toggle = register("giftEnabled", { onChange: (e) => setGiftWrap(Boolean(e.target.checked)) });

  return (
    <Section id="ck-gift-title" title={t("legend")}>
      <Checkbox {...toggle} label={t("toggle")} description={t("toggleNote")} />
      {giftEnabled && (
        <div className="mt-5 space-y-6 border-s-2 border-sand ps-4 sm:ps-6">
          <Checkbox
            checked={giftWrap}
            onChange={(e) => setGiftWrap(e.target.checked)}
            label={t("wrap")}
            description={t("wrapNote")}
          />
          <div className="grid gap-5 sm:grid-cols-2 sm:gap-x-4">
            <CheckoutField name="giftRecipient" label={t("recipient")} optional>
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  dir="auto"
                  autoComplete="off"
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  {...register("giftRecipient")}
                />
              )}
            </CheckoutField>
            <CheckoutField name="giftPhone" label={t("recipientPhone")} optional hint={t("recipientPhoneHint")}>
              {({ id, describedBy, invalid }) => (
                <PhoneInput
                  id={id}
                  autoComplete="off"
                  aria-describedby={describedBy}
                  invalid={invalid}
                  {...withLatinDigits(register("giftPhone"))}
                />
              )}
            </CheckoutField>
          </div>
          <GiftMessage />
          <div id={anchorId("hidePrices")}>
            <Checkbox {...register("hidePrices")} label={t("hidePrices")} description={t("hidePricesNote")} />
          </div>
        </div>
      )}
    </Section>
  );
}
