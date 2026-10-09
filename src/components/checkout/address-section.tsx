"use client";

import { BriefcaseBusiness, Building2, House } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { TextArea, TextInput } from "@/components/ui/form";
import { areaById, governorates } from "@/data/kuwait-areas";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import type { CheckoutForm } from "@/lib/validation";
import { AreaCombobox } from "./area-combobox";
import { anchorId, CheckoutField, Section, withLatinDigits } from "./form-helpers";

const HOUSING = [
  { value: "house", Icon: House },
  { value: "apartment", Icon: Building2 },
  { value: "office", Icon: BriefcaseBusiness },
] as const;

/** House / Apartment / Office as a segmented control (native radios underneath). */
function HousingToggle({ className }: { className?: string }) {
  const t = useTranslations("checkout.address");
  const { register } = useFormContext<CheckoutForm>();
  return (
    <fieldset id={anchorId("housing")} className={cn("min-w-0", className)}>
      <legend className="mb-1.5 p-0 text-[14px]">{t("housing")}</legend>
      <div className="grid grid-cols-3">
        {HOUSING.map(({ value, Icon }, i) => (
          <label
            key={value}
            className={cn(
              "relative flex min-h-12 cursor-pointer items-center justify-center gap-2 border border-line bg-paper px-2 text-[14px] transition-colors",
              "has-[:checked]:z-10 has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-paper",
              "has-[:focus-visible]:z-20 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-racing",
              i > 0 && "-ms-px",
            )}
          >
            <input type="radio" value={value} className="sr-only" {...register("housing")} />
            <Icon className="size-4 shrink-0" strokeWidth={1.25} aria-hidden />
            {t(value)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function AddressSection() {
  const t = useTranslations("checkout.address");
  const locale = useLocale() as Locale;
  const { register, control } = useFormContext<CheckoutForm>();
  const [housing, areaId] = useWatch({ control, name: ["housing", "areaId"] });
  const area = areaId ? areaById(areaId) : undefined;
  const flat = housing !== "house";

  return (
    <Section id="ck-address-title" title={t("legend")} intro={t("intro")}>
      <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-6 sm:gap-x-4">
        <Controller
          control={control}
          name="areaId"
          render={({ field }) => (
            <CheckoutField
              name="areaId"
              label={t("area")}
              hint={area ? t("governorate", { name: governorates[area.governorate][locale] }) : t("areaHint")}
              className="col-span-2 sm:col-span-6"
            >
              {({ id, describedBy, invalid }) => (
                <AreaCombobox
                  ref={field.ref}
                  id={id}
                  name={field.name}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  invalid={invalid}
                  describedBy={describedBy}
                />
              )}
            </CheckoutField>
          )}
        />

        <HousingToggle className="col-span-2 sm:col-span-6" />

        <CheckoutField name="block" label={t("block")} className="sm:col-span-2">
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              inputMode="numeric"
              autoComplete="off"
              enterKeyHint="next"
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              {...withLatinDigits(register("block"))}
            />
          )}
        </CheckoutField>
        <CheckoutField name="street" label={t("street")} className="sm:col-span-4">
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              dir="auto"
              autoComplete="off"
              enterKeyHint="next"
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              {...withLatinDigits(register("street"))}
            />
          )}
        </CheckoutField>
        <CheckoutField name="avenue" label={t("avenue")} optional className="sm:col-span-3">
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              dir="auto"
              autoComplete="off"
              enterKeyHint="next"
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              {...withLatinDigits(register("avenue"))}
            />
          )}
        </CheckoutField>
        <CheckoutField name="building" label={flat ? t("buildingNo") : t("houseNo")} className="sm:col-span-3">
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              autoComplete="off"
              enterKeyHint="next"
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              {...withLatinDigits(register("building"))}
            />
          )}
        </CheckoutField>
        {flat && (
          <>
            <CheckoutField name="floor" label={t("floor")} className="sm:col-span-3">
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  autoComplete="off"
                  enterKeyHint="next"
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  {...withLatinDigits(register("floor"))}
                />
              )}
            </CheckoutField>
            <CheckoutField
              name="apartment"
              label={housing === "office" ? t("officeNo") : t("apartmentNo")}
              className="sm:col-span-3"
            >
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  autoComplete="off"
                  enterKeyHint="next"
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  {...withLatinDigits(register("apartment"))}
                />
              )}
            </CheckoutField>
          </>
        )}

        <CheckoutField
          name="mapsLink"
          label={t("mapsLink")}
          optional
          hint={t("mapsHint")}
          className="col-span-2 sm:col-span-6"
        >
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              type="url"
              inputMode="url"
              dir="ltr"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="https://maps.app.goo.gl/…"
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              className="rtl:text-end"
              {...register("mapsLink")}
            />
          )}
        </CheckoutField>
        <CheckoutField name="notes" label={t("notes")} optional className="col-span-2 sm:col-span-6">
          {({ id, describedBy, invalid }) => (
            <TextArea
              id={id}
              dir="auto"
              rows={3}
              maxLength={300}
              placeholder={t("notesPlaceholder")}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              {...register("notes")}
            />
          )}
        </CheckoutField>
      </div>
    </Section>
  );
}
