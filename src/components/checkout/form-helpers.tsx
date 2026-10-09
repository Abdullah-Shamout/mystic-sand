"use client";

import { useTranslations } from "next-intl";
import { forwardRef, useId } from "react";
import { useFormState, type UseFormRegisterReturn } from "react-hook-form";
import { Field } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { toLatinDigits } from "@/lib/digits";
import type { CheckoutForm } from "@/lib/validation";

export type FieldName = keyof CheckoutForm;

export const FORM_ID = "checkout-form";
export const PAY_BUTTON_ID = "checkout-pay";

/** DOM order of the form — the first invalid field in this list gets focus. */
export const FIELD_ORDER: FieldName[] = [
  "name",
  "phone",
  "email",
  "areaId",
  "housing",
  "block",
  "street",
  "avenue",
  "building",
  "floor",
  "apartment",
  "mapsLink",
  "notes",
  "deliveryMethod",
  "paymentMethod",
  "acceptTerms",
];

/** Stable anchor around each field, so the error summary can link to it. */
export const anchorId = (name: FieldName) => `ck-${name}`;

/** Bidi-isolates user text inside translated strings (FSI … PDI). */
export const iso = (value: string) => `\u2068${value}\u2069`;

export function focusField(name: FieldName) {
  const wrap = document.getElementById(anchorId(name));
  const el =
    wrap?.querySelector<HTMLElement>("input[type=radio]:checked") ??
    wrap?.querySelector<HTMLElement>(
      "input:not([type=hidden]):not([disabled]), textarea, select, button:not([tabindex='-1'])",
    );
  if (!el) return;
  el.focus({ preventScroll: true });
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
}

/** Arabic keyboards type ٠-٩; convert as the shopper types so validation and display agree. */
export function withLatinDigits(reg: UseFormRegisterReturn): UseFormRegisterReturn {
  return {
    ...reg,
    onChange: (event) => {
      const el = event.target as HTMLInputElement;
      const latin = toLatinDigits(el.value);
      if (latin !== el.value) el.value = latin;
      return reg.onChange(event);
    },
  };
}

/** Translated error for a field (zod returns message keys). */
export function useFieldError(name: FieldName): string | undefined {
  const t = useTranslations("checkout");
  const { errors } = useFormState<CheckoutForm>({ name });
  const key = errors[name]?.message;
  if (!key) return undefined;
  return t.has(`errors.${key}`) ? t(`errors.${key}`) : t("errors.generic");
}

export function CheckoutField({
  name,
  label,
  optional = false,
  hint,
  className,
  children,
}: {
  name: FieldName;
  label: string;
  optional?: boolean;
  hint?: string;
  className?: string;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode;
}) {
  const t = useTranslations("checkout");
  const error = useFieldError(name);
  return (
    <div id={anchorId(name)} className={cn("scroll-mt-6", className)}>
      <Field label={label} optional={optional ? t("optional") : undefined} hint={hint} error={error}>
        {children}
      </Field>
    </div>
  );
}

/** Kuwaiti mobile with a fixed +965 prefix; always left-to-right, also in Arabic. */
export const PhoneInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function PhoneInput({ invalid = false, className, ...props }, ref) {
  return (
    <div
      dir="ltr"
      className={cn(
        "flex h-12 w-full border bg-paper transition-colors focus-within:border-ink",
        invalid ? "border-danger" : "border-line",
        className,
      )}
    >
      <span aria-hidden className="figures flex shrink-0 select-none items-center border-e border-line bg-tile px-3.5 text-muted">
        +965
      </span>
      <input
        ref={ref}
        type="tel"
        inputMode="tel"
        dir="ltr"
        maxLength={16}
        aria-invalid={invalid || undefined}
        className="figures h-full min-w-0 flex-1 bg-transparent px-3.5 text-ink outline-none placeholder:text-muted/70"
        {...props}
      />
    </div>
  );
});

/**
 * Selectable card for delivery and payment (same look as ui/RadioCard). The title is the
 * accessible name and the details are its description; a disabled card keeps its reason
 * readable instead of fading it out.
 */
export const ChoiceCard = forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "title"> & {
    title: React.ReactNode;
    description?: React.ReactNode;
    aside?: React.ReactNode;
    /** Logos and marks that would only repeat the title. */
    decorativeAside?: boolean;
  }
>(function ChoiceCard({ title, description, aside, decorativeAside = false, className, disabled, ...props }, ref) {
  const id = useId();
  const describedBy = [description && `${id}-d`, aside && !decorativeAside && `${id}-a`].filter(Boolean).join(" ");
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-16 items-start gap-3 border border-line p-4 transition-colors",
        "has-[:checked]:border-ink has-[:checked]:bg-tile has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-racing",
        disabled ? "cursor-not-allowed bg-tile/50" : "cursor-pointer bg-paper",
        className,
      )}
    >
      <input
        ref={ref}
        id={id}
        type="radio"
        disabled={disabled}
        aria-labelledby={`${id}-t`}
        aria-describedby={describedBy || undefined}
        className="mt-1 size-[18px] shrink-0 cursor-pointer accent-racing disabled:cursor-not-allowed"
        {...props}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span id={`${id}-t`} className={cn("text-[15px] leading-snug font-medium", disabled && "text-muted")}>
          {title}
        </span>
        {description && (
          <span id={`${id}-d`} className={cn("text-[13px] leading-snug", disabled ? "text-ink" : "text-muted")}>
            {description}
          </span>
        )}
      </span>
      {aside && (
        <span id={`${id}-a`} aria-hidden={decorativeAside || undefined} className={cn("shrink-0", disabled && "text-muted")}>
          {aside}
        </span>
      )}
    </label>
  );
});

/** A form section: <fieldset> whose <legend> is also a heading, for screen-reader navigation. */
export function Section({
  id,
  anchor,
  title,
  intro,
  children,
  className,
}: {
  id: string;
  /** Optional URL fragment target, e.g. /checkout#payment. */
  anchor?: string;
  title: string;
  intro?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={anchor} aria-labelledby={id} className={cn("scroll-mt-6 border-t border-line pt-8", className)}>
      <fieldset className="min-w-0">
        <legend className="w-full p-0">
          <h2 id={id} className="caps font-serif text-[22px] leading-tight font-medium md:text-title-sm">
            {title}
          </h2>
        </legend>
        {intro && <p className="mt-1.5 text-[14px] text-muted">{intro}</p>}
        <div className="mt-6">{children}</div>
      </fieldset>
    </section>
  );
}
