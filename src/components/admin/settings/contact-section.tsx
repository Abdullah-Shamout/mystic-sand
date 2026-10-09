"use client";

import { MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PhoneInput } from "@/components/checkout/form-helpers";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
import { toLatinDigits } from "@/lib/digits";
import { normalizeKuwaitPhone, phoneStatus } from "@/lib/phone";
import { phoneDisplay, resolveSettings, whatsappDisplay, whatsappHref } from "@/lib/settings";
import { useSettingsStore } from "@/store/settings";
import { useUi } from "@/store/ui";
import { ResetLink, SettingsCard } from "./settings-ui";

const localPart = (whatsapp: string) => whatsapp.replace(/^965/, "");

/** WhatsApp (Kuwaiti mobile) and the contact phone (mobile or landline). */
export function ContactSection() {
  const t = useTranslations("admin");
  const overrides = useSettingsStore((s) => s.overrides);
  const setOverrides = useSettingsStore((s) => s.setOverrides);
  const resetField = useSettingsStore((s) => s.resetField);
  const pushToast = useUi((s) => s.pushToast);
  const current = resolveSettings(overrides);

  const [whatsapp, setWhatsapp] = useState(() => localPart(current.whatsapp));
  const [phone, setPhone] = useState(() => current.phone);
  const [errors, setErrors] = useState<{ whatsapp?: boolean; phone?: boolean }>({});

  const whatsappValid = phoneStatus(whatsapp) === "valid";
  const phoneStatusNow = phoneStatus(phone);
  const phoneValid = phoneStatusNow === "valid" || phoneStatusNow === "landline";

  const save = () => {
    setErrors({ whatsapp: !whatsappValid, phone: !phoneValid });
    if (!whatsappValid || !phoneValid) return;
    setOverrides({
      whatsapp: `965${normalizeKuwaitPhone(whatsapp)}`,
      phone: normalizeKuwaitPhone(phone),
    });
    pushToast({ title: t("settings.saved") });
  };

  const resetWhatsapp = () => {
    resetField("whatsapp");
    setWhatsapp(localPart(resolveSettings({ ...overrides, whatsapp: undefined }).whatsapp));
    setErrors((e) => ({ ...e, whatsapp: false }));
    pushToast({ title: t("settings.saved") });
  };
  const resetPhone = () => {
    resetField("phone");
    setPhone(resolveSettings({ ...overrides, phone: undefined }).phone);
    setErrors((e) => ({ ...e, phone: false }));
    pushToast({ title: t("settings.saved") });
  };

  return (
    <SettingsCard title={t("settings.contact.title")} intro={t("settings.contact.intro")}>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Field
            label={t("settings.contact.whatsapp")}
            hint={t("settings.contact.whatsappHint")}
            error={errors.whatsapp ? t("settings.contact.whatsappError") : undefined}
          >
            {({ id, describedBy, invalid }) => (
              <PhoneInput
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                value={whatsapp}
                onChange={(e) => setWhatsapp(toLatinDigits(e.target.value))}
                data-testid="settings-whatsapp"
              />
            )}
          </Field>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <p className="text-[12px] text-muted">
              {t("settings.contact.shownAs")}{" "}
              <bdi dir="ltr" className="figures text-ink">
                {whatsappDisplay(current)}
              </bdi>
            </p>
            <ResetLink onClick={resetWhatsapp} testId="settings-whatsapp-reset" />
          </div>
          <a
            href={whatsappHref(current, t("settings.contact.testMessage"))}
            target="_blank"
            rel="noreferrer"
            className="caps mt-2 inline-flex min-h-9 items-center gap-1.5 text-[12px] text-racing underline-offset-4 hover:underline"
            data-testid="settings-whatsapp-test"
          >
            <MessageCircle className="size-3.5" strokeWidth={1.5} aria-hidden />
            {t("settings.contact.testWhatsapp")}
          </a>
        </div>

        <div>
          <Field
            label={t("settings.contact.phone")}
            hint={t("settings.contact.phoneHint")}
            error={errors.phone ? t("settings.contact.phoneError") : undefined}
          >
            {({ id, describedBy, invalid }) => (
              <PhoneInput
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                value={phone}
                onChange={(e) => setPhone(toLatinDigits(e.target.value))}
                data-testid="settings-phone"
              />
            )}
          </Field>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <p className="text-[12px] text-muted">
              {t("settings.contact.shownAs")}{" "}
              <bdi dir="ltr" className="figures text-ink">
                {phoneDisplay(current)}
              </bdi>
            </p>
            <ResetLink onClick={resetPhone} testId="settings-phone-reset" />
          </div>
        </div>
      </div>
      <Button type="button" size="sm" onClick={save} data-testid="settings-contact-save">
        {t("settings.save")}
      </Button>
    </SettingsCard>
  );
}
