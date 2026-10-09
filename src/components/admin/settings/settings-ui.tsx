"use client";

import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { forwardRef, useState } from "react";
import { TextInput } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { toLatinDigits } from "@/lib/digits";

// Shared building blocks for the store-settings sections. Each section is its own card with a
// heading, a Save action and the standing note that everything is saved in this browser only.

export function SettingsCard({
  title,
  intro,
  children,
  testId,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
  testId?: string;
}) {
  const t = useTranslations("admin");
  return (
    <section className="border border-line bg-paper p-5 sm:p-6" data-testid={testId}>
      <h2 className="caps font-serif text-[22px] leading-tight font-medium">{title}</h2>
      {intro && <p className="mt-1.5 max-w-prose text-[14px] leading-relaxed text-muted">{intro}</p>}
      <div className="mt-5 space-y-5">{children}</div>
      <p className="mt-6 border-t border-line pt-3 text-[12px] leading-snug text-muted">
        {t("settings.browserNote")}
      </p>
    </section>
  );
}

/** Small "Reset to default" text button shown beside a field. */
export function ResetLink({ onClick, testId }: { onClick: () => void; testId?: string }) {
  const t = useTranslations("admin");
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="caps text-[12px] text-muted underline underline-offset-4 transition-colors hover:text-ink"
    >
      {t("settings.resetToDefault")}
    </button>
  );
}

/** Input with a fixed, non-editable affix (e.g. "KWD"); always left-to-right, like PhoneInput. */
export const AffixInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { prefix: string; invalid?: boolean }
>(function AffixInput({ prefix, invalid = false, className, ...props }, ref) {
  return (
    <div
      dir="ltr"
      className={cn(
        "flex h-12 w-full border bg-paper transition-colors focus-within:border-ink",
        invalid ? "border-danger" : "border-line",
        className,
      )}
    >
      <span
        aria-hidden
        className="figures flex shrink-0 select-none items-center border-e border-line bg-tile px-3.5 text-muted"
      >
        {prefix}
      </span>
      <input
        ref={ref}
        dir="ltr"
        aria-invalid={invalid || undefined}
        className="figures h-full min-w-0 flex-1 bg-transparent px-3.5 text-ink outline-none placeholder:text-muted/70"
        {...props}
      />
    </div>
  );
});

/** Password input with a show/hide toggle, matching the sign-in form. */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function PasswordInput({ invalid = false, className, ...props }, ref) {
  const t = useTranslations("admin");
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <TextInput
        ref={ref}
        type={show ? "text" : "password"}
        dir="ltr"
        aria-invalid={invalid || undefined}
        className={cn("pe-12", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-pressed={show}
        aria-label={show ? t("settings.account.hide") : t("settings.account.show")}
        className="absolute inset-e-0 top-0 inline-flex h-12 w-12 items-center justify-center text-muted transition-colors hover:text-ink"
      >
        {show ? <EyeOff className="size-5" strokeWidth={1.25} aria-hidden /> : <Eye className="size-5" strokeWidth={1.25} aria-hidden />}
      </button>
    </div>
  );
});

// ── Parsing helpers ───────────────────────────────────────────────────────────

const FEE_MAX_KWD = 50;

/** KWD string (Arabic digits accepted, up to 3 decimals, 0–50) → integer fils, or null. */
export function parseFeeFils(input: string): number | null {
  const s = toLatinDigits(input ?? "").trim();
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return null;
  const kwd = Number(s);
  if (!Number.isFinite(kwd) || kwd < 0 || kwd > FEE_MAX_KWD) return null;
  return Math.round(kwd * 1000);
}

/** Fils → the KWD string shown in a fee input, e.g. 1500 → "1.500". */
export const feeToInput = (fils: number): string => (fils / 1000).toFixed(3);

/** Groups a character count with thousands separators (Latin digits, for both locales). */
export const groupNumber = (n: number): string =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
