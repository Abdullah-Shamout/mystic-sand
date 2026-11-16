"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
import { useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { toLatinDigits } from "@/lib/digits";
import { formatKWD } from "@/lib/money";
import { defaultSettings } from "@/lib/settings";
import { useLiveSettings } from "@/lib/live";
import { saveSettings } from "@/server/actions/settings";
import { useUi } from "@/store/ui";
import { AffixInput, feeToInput, parseFeeFils, ResetLink, SettingsCard } from "./settings-ui";

/** The single delivery fee, in KWD, stored as integer fils in the DB (settings singleton). */
export function DeliverySection() {
  const t = useTranslations("admin");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const current = useLiveSettings();
  const pushToast = useUi((s) => s.pushToast);

  const [fee, setFee] = useState(() => feeToInput(current.standardFeeFils));
  const [invalid, setInvalid] = useState(false);
  const [saving, setSaving] = useState(false);

  // Persists the fee to the DB (saveSettings), then refreshes so the live settings context — and
  // the "in use" line below — reflect the new value.
  const commit = async (standardFeeFils: number) => {
    setSaving(true);
    try {
      await saveSettings({ standardFeeFils });
      setFee(feeToInput(standardFeeFils));
      router.refresh();
      pushToast({ title: t("settings.saved") });
    } catch {
      pushToast({ title: t("settings.saveError") });
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    const standardFeeFils = parseFeeFils(fee);
    setInvalid(standardFeeFils === null);
    if (standardFeeFils === null) return;
    void commit(standardFeeFils);
  };

  const reset = () => {
    setInvalid(false);
    void commit(defaultSettings.standardFeeFils);
  };

  return (
    <SettingsCard title={t("settings.delivery.title")} intro={t("settings.delivery.intro")} note={t("settings.storeNote")}>
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
      <Button type="button" size="sm" busy={saving} onClick={save} data-testid="settings-fee-save">
        {t("settings.save")}
      </Button>
    </SettingsCard>
  );
}
