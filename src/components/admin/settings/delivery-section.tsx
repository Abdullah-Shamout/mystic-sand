"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
import type { Locale } from "@/i18n/routing";
import { toLatinDigits } from "@/lib/digits";
import { formatKWD } from "@/lib/money";
import { resolveSettings } from "@/lib/settings";
import { useSettingsStore } from "@/store/settings";
import { useUi } from "@/store/ui";
import { AffixInput, feeToInput, parseFeeFils, ResetLink, SettingsCard } from "./settings-ui";

/** The single delivery fee, in KWD, stored as integer fils. */
export function DeliverySection() {
  const t = useTranslations("admin");
  const locale = useLocale() as Locale;
  const overrides = useSettingsStore((s) => s.overrides);
  const setOverrides = useSettingsStore((s) => s.setOverrides);
  const resetField = useSettingsStore((s) => s.resetField);
  const pushToast = useUi((s) => s.pushToast);
  const current = resolveSettings(overrides);

  const [fee, setFee] = useState(() => feeToInput(current.standardFeeFils));
  const [invalid, setInvalid] = useState(false);

  const save = () => {
    const standardFeeFils = parseFeeFils(fee);
    setInvalid(standardFeeFils === null);
    if (standardFeeFils === null) return;
    setOverrides({ standardFeeFils });
    setFee(feeToInput(standardFeeFils));
    pushToast({ title: t("settings.saved") });
  };

  const reset = () => {
    resetField("standardFeeFils");
    setFee(feeToInput(resolveSettings({ ...overrides, standardFeeFils: undefined }).standardFeeFils));
    setInvalid(false);
    pushToast({ title: t("settings.saved") });
  };

  return (
    <SettingsCard title={t("settings.delivery.title")} intro={t("settings.delivery.intro")}>
      <div className="max-w-xs">
        <Field
          label={t("settings.delivery.fee")}
          hint={t("settings.delivery.hint")}
          error={invalid ? t("settings.delivery.error") : undefined}
        >
          {({ id, describedBy, invalid: isInvalid }) => (
            <AffixInput
              id={id}
              prefix="KWD"
              inputMode="decimal"
              aria-describedby={describedBy}
              invalid={isInvalid}
              value={fee}
              onChange={(e) => setFee(toLatinDigits(e.target.value))}
              data-testid="settings-standard-fee"
            />
          )}
        </Field>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="text-[12px] text-muted">
            {t("settings.inUse")}{" "}
            <bdi className="figures text-ink">{formatKWD(current.standardFeeFils, locale)}</bdi>
          </p>
          <ResetLink onClick={reset} testId="settings-standard-reset" />
        </div>
      </div>
      <Button type="button" size="sm" onClick={save} data-testid="settings-fee-save">
        {t("settings.save")}
      </Button>
    </SettingsCard>
  );
}
