"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/form";
import { setAdminCredentials, useAdminSession, verifyAdmin } from "@/lib/admin-auth";
import { useUi } from "@/store/ui";
import { PasswordInput, SettingsCard } from "./settings-ui";

type AccountErrors = Partial<Record<"current" | "username" | "password" | "confirm", boolean>>;

/** Change the admin username and password. Browser-only demo gate — see lib/admin-auth.ts. */
export function AccountSection() {
  const t = useTranslations("admin");
  const session = useAdminSession();
  const pushToast = useUi((s) => s.pushToast);

  const [current, setCurrent] = useState("");
  const [username, setUsername] = useState(session ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<AccountErrors>({});
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;

    const next: AccountErrors = {
      username: username.trim().length < 2 || username.trim().length > 32,
      password: password.length < 8,
      confirm: confirm !== password,
    };
    setErrors(next);
    if (next.username || next.password || next.confirm) return;

    setBusy(true);
    const ok = await verifyAdmin(session ?? username, current);
    if (!ok) {
      setBusy(false);
      setErrors({ current: true });
      return;
    }
    await setAdminCredentials(username.trim(), password);
    setBusy(false);
    // The session is kept (the admin stays signed in); only the stored credentials change.
    setCurrent("");
    setPassword("");
    setConfirm("");
    setErrors({});
    pushToast({ title: t("settings.account.saved") });
  };

  const clearError = (key: keyof AccountErrors) =>
    setErrors((e) => (e[key] ? { ...e, [key]: false } : e));

  return (
    <SettingsCard title={t("settings.account.title")} intro={t("settings.account.intro")}>
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
                clearError("current");
              }}
              data-testid="account-current"
            />
          )}
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label={t("settings.account.newUsername")}
            error={errors.username ? t("settings.account.errors.username") : undefined}
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
                  clearError("username");
                }}
                data-testid="account-username"
              />
            )}
          </Field>
        </div>

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
                  clearError("password");
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
                  clearError("confirm");
                }}
                data-testid="account-confirm"
              />
            )}
          </Field>
        </div>

        <Button type="submit" size="sm" busy={busy} data-testid="account-save">
          {t("settings.account.save")}
        </Button>
      </form>
    </SettingsCard>
  );
}
