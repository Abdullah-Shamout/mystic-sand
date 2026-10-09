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

/** Delivery fees (standard and express) in KWD, stored as integer fils. */
export function DeliverySection() {
  const t = useTranslations("admin");
  const locale = useLocale() as Locale;
  const overrides = useSettingsStore((s) => s.overrides);
  const setOverrides = useSettingsStore((s) => s.setOverrides);
  const resetField = useSettingsStore((s) => s.resetField);
  const pushToast = useUi((s) => s.pushToast);
  const current = resolveSettings(overrides);

  const [standard, setStandard] = useState(() => feeToInput(current.standardFeeFils));
  const [express, setExpress] = useState(() => feeToInput(current.expressFeeFils));
  const [errors, setErrors] = useState<{ standard?: boolean; express?: boolean }>({});

  const save = () => {
    const standardFeeFils = parseFeeFils(standard);
    const expressFeeFils = parseFeeFils(express);
    const nextErrors = { standard: standardFeeFils === null, express: expressFeeFils === null };
    setErrors(nextErrors);
    if (standardFeeFils === null || expressFeeFils === null) return;
    setOverrides({ standardFeeFils, expressFeeFils });
    setStandard(feeToInput(standardFeeFils));
    setExpress(feeToInput(expressFeeFils));
    pushToast({ title: t("settings.saved") });
  };

  const resetStandard = () => {
    resetField("standardFeeFils");
    setStandard(feeToInput(resolveSettings({ ...overrides, standardFeeFils: undefined }).standardFeeFils));
    setErrors((e) => ({ ...e, standard: false }));
    pushToast({ title: t("settings.saved") });
  };
  const resetExpress = () => {
    resetField("expressFeeFils");
    setExpress(feeToInput(resolveSettings({ ...overrides, expressFeeFils: undefined }).expressFeeFils));
    setErrors((e) => ({ ...e, express: false }));
    pushToast({ title: t("settings.saved") });
  };

  return (
    <SettingsCard title={t("settings.delivery.title")} intro={t("settings.delivery.intro")}>
      <div className="grid gap-5 sm:grid-cols-2">
        <Fee
          label={t("settings.delivery.standard")}
          hint={t("settings.delivery.hint")}
          value={standard}
          onChange={setStandard}
          invalid={errors.standard}
          current={formatKWD(current.standardFeeFils, locale)}
          onReset={resetStandard}
          testId="standard"
        />
        <Fee
          label={t("settings.delivery.express")}
          hint={t("settings.delivery.hint")}
          value={express}
          onChange={setExpress}
          invalid={errors.express}
          current={formatKWD(current.expressFeeFils, locale)}
          onReset={resetExpress}
          testId="express"
        />
      </div>
      <Button type="button" size="sm" onClick={save} data-testid="settings-fee-save">
        {t("settings.save")}
      </Button>
    </SettingsCard>
  );
}

function Fee({
  label,
  hint,
  value,
  onChange,
  invalid,
  current,
  onReset,
  testId,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  current: string;
  onReset: () => void;
  testId: string;
}) {
  const t = useTranslations("admin");
  return (
    <div>
      <Field label={label} hint={hint} error={invalid ? t("settings.delivery.error") : undefined}>
        {({ id, describedBy, invalid: isInvalid }) => (
          <AffixInput
            id={id}
            prefix="KWD"
            inputMode="decimal"
            aria-describedby={describedBy}
            invalid={isInvalid}
            value={value}
            onChange={(e) => onChange(toLatinDigits(e.target.value))}
            data-testid={`settings-${testId}-fee`}
          />
        )}
      </Field>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-[12px] text-muted">
          {t("settings.inUse")}{" "}<bdi className="figures text-ink">{current}</bdi>
        </p>
        <ResetLink onClick={onReset} testId={`settings-${testId}-reset`} />
      </div>
    </div>
  );
}
