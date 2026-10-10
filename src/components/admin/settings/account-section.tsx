"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/form";
import { setAdminCredentials, useAdminSession, verifyAdmin } from "@/lib/admin-auth";
import { cn } from "@/lib/cn";
import { useUi } from "@/store/ui";
import { PasswordInput, SettingsCard } from "./settings-ui";

/**
 * The admin account, split into two independent cards: change the username, or change the password.
 * Both ask for the current password. The password rule is strong (length + capital + number +
 * special), shown as a live checklist that blocks saving until every rule passes. Browser-only demo
 * gate — see lib/admin-auth.ts.
 */

/** Strong-password rules, each a boolean for the live checklist. */
export type PasswordChecks = {
  length: boolean;
  upper: boolean;
  number: boolean;
  special: boolean;
};

export function passwordChecks(password: string): PasswordChecks {
  return {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
}

export const passwordIsStrong = (password: string): boolean =>
  Object.values(passwordChecks(password)).every(Boolean);

export function AccountSection() {
  return (
    <>
      <UsernameSection />
      <PasswordSection />
    </>
  );
}

function UsernameSection() {
  const t = useTranslations("admin");
  const session = useAdminSession();
  const pushToast = useUi((s) => s.pushToast);

  const [current, setCurrent] = useState("");
  const [username, setUsername] = useState(session ?? "");
  const [errors, setErrors] = useState<{ current?: boolean; username?: boolean }>({});
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const name = username.trim();
    if (name.length < 2 || name.length > 32) {
      setErrors({ username: true });
      return;
    }
    setBusy(true);
    const ok = await verifyAdmin(session ?? name, current);
    if (!ok) {
      setBusy(false);
      setErrors({ current: true });
      return;
    }
    await setAdminCredentials(name, current);
    setBusy(false);
    setCurrent("");
    setErrors({});
    pushToast({ title: t("settings.account.username.saved") });
  };

  return (
    <SettingsCard title={t("settings.account.username.title")} intro={t("settings.account.username.intro")}>
      <p className="-mt-2 border-s-2 border-sand ps-3 text-[13px] leading-relaxed text-muted">
        {t("settings.account.note")}
      </p>

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
              data-testid="account-username-current"
            />
          )}
        </Field>

        <Field
          label={t("settings.account.newUsername")}
          error={errors.username ? t("settings.account.errors.username") : undefined}
          className="max-w-sm"
        >
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              dir="ltr"
              autoComplete="username"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={32}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setErrors((prev) => (prev.username ? { ...prev, username: false } : prev));
              }}
              data-testid="account-username"
            />
          )}
        </Field>

        <Button type="submit" size="sm" busy={busy} data-testid="account-username-save">
          {t("settings.account.username.save")}
        </Button>
      </form>
    </SettingsCard>
  );
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
  const session = useAdminSession();
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
    const ok = await verifyAdmin(session ?? "", current);
    if (!ok) {
      setBusy(false);
      setErrors({ current: true });
      return;
    }
    await setAdminCredentials(session ?? "", password);
    setBusy(false);
    setCurrent("");
    setPassword("");
    setConfirm("");
    setErrors({});
    pushToast({ title: t("settings.account.password.saved") });
  };

  return (
    <SettingsCard title={t("settings.account.password.title")} intro={t("settings.account.password.intro")}>
      <p className="-mt-2 border-s-2 border-sand ps-3 text-[13px] leading-relaxed text-muted">
        {t("settings.account.note")}
      </p>

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
