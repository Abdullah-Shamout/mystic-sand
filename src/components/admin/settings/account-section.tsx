"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { passwordChecks, passwordIsStrong } from "@/lib/password-policy";
import { changePassword } from "@/server/actions/auth";
import { useUi } from "@/store/ui";
import { PasswordInput, SettingsCard } from "./settings-ui";

// The admin account: change the signed-in admin's password. The current password is required; the
// new one must pass the shared strong-password policy (lib/password-policy.ts — the same rule the
// server enforces), shown as a live checklist that blocks saving until every rule passes. The write
// goes through the changePassword Server Action (verifies current, rotates the hash, signs other
// devices out). Username changes were dropped with the browser-only gate.

// Re-exported for any older importer; the single source of truth is lib/password-policy.ts.
export { passwordChecks, passwordIsStrong } from "@/lib/password-policy";
export type { PasswordChecks } from "@/lib/password-policy";

export function AccountSection() {
  return <PasswordSection />;
}

function RuleItem({ met, label, testId }: { met: boolean; label: string; testId: string }) {
  return (
    <li
      data-testid={testId}
      data-met={met ? "true" : "false"}
      className={cn("flex items-center gap-2 transition-colors", met ? "text-success" : "text-muted")}
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex size-4 shrink-0 items-center justify-center rounded-full border",
          met ? "border-success bg-success/10" : "border-line",
        )}
      >
        {met && <Check className="size-3" strokeWidth={2} />}
      </span>
      {label}
    </li>
  );
}

function PasswordSection() {
  const t = useTranslations("admin");
  const pushToast = useUi((s) => s.pushToast);

  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ current?: boolean; password?: boolean; confirm?: boolean }>({});
  const [busy, setBusy] = useState(false);

  const checks = passwordChecks(password);
  const strong = passwordIsStrong(password);
  const matches = confirm.length > 0 && confirm === password;
  const canSave = strong && matches;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const next = { password: !strong, confirm: confirm !== password };
    setErrors(next);
    if (next.password || next.confirm) return;

    setBusy(true);
    try {
      const result = await changePassword({ current, next: password });
      if (result.ok) {
        setCurrent("");
        setPassword("");
        setConfirm("");
        setErrors({});
        pushToast({ title: t("settings.account.password.saved") });
      } else if (result.error === "current") {
        setErrors({ current: true });
      } else {
        // weak / same / unauthorized — surface on the new-password field
        setErrors({ password: true });
      }
    } catch {
      setErrors({ password: true });
    }
    setBusy(false);
  };

  return (
    <SettingsCard title={t("settings.account.password.title")} intro={t("settings.account.password.intro")}>
      <form onSubmit={submit} noValidate className="space-y-5">
        <Field
          label={t("settings.account.current")}
          error={errors.current ? t("settings.account.errors.current") : undefined}
          className="max-w-sm"
        >
          {({ id, describedBy, invalid }) => (
            <PasswordInput
              id={id}
              autoComplete="current-password"
              aria-describedby={describedBy}
              invalid={invalid}
              value={current}
              onChange={(e) => {
                setCurrent(e.target.value);
                setErrors((prev) => (prev.current ? { ...prev, current: false } : prev));
              }}
              data-testid="account-password-current"
            />
          )}
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label={t("settings.account.newPassword")}
            error={errors.password ? t("settings.account.errors.password") : undefined}
          >
            {({ id, describedBy, invalid }) => (
              <PasswordInput
                id={id}
                autoComplete="new-password"
                aria-describedby={describedBy}
                invalid={invalid}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrors((prev) => (prev.password ? { ...prev, password: false } : prev));
                }}
                data-testid="account-new"
              />
            )}
          </Field>
          <Field
            label={t("settings.account.confirm")}
            error={errors.confirm ? t("settings.account.errors.confirm") : undefined}
          >
            {({ id, describedBy, invalid }) => (
              <PasswordInput
                id={id}
                autoComplete="new-password"
                aria-describedby={describedBy}
                invalid={invalid}
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setErrors((prev) => (prev.confirm ? { ...prev, confirm: false } : prev));
                }}
                data-testid="account-confirm"
              />
            )}
          </Field>
        </div>

        <div>
          <p className="caps text-[12px] text-muted">{t("settings.account.rules.title")}</p>
          <ul className="mt-2 space-y-1.5 text-[13px]" data-testid="password-rules">
            <RuleItem met={checks.length} label={t("settings.account.rules.length")} testId="rule-length" />
            <RuleItem met={checks.upper} label={t("settings.account.rules.upper")} testId="rule-upper" />
            <RuleItem met={checks.number} label={t("settings.account.rules.number")} testId="rule-number" />
            <RuleItem met={checks.special} label={t("settings.account.rules.special")} testId="rule-special" />
          </ul>
        </div>

        <Button type="submit" size="sm" busy={busy} disabled={!canSave} data-testid="account-password-save">
          {t("settings.account.password.save")}
        </Button>
      </form>
    </SettingsCard>
  );
}
