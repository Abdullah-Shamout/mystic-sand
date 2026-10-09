"use client";

import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, TextInput } from "@/components/ui/form";
import { startAdminSession, verifyAdmin } from "@/lib/admin-auth";

/**
 * Shared sign-in form for the login dialog and the admin full-page gate. On success it
 * starts the session and calls `onSuccess` (the caller navigates / closes). This is a
 * browser-only demo gate — see lib/admin-auth.ts.
 */
export function LoginForm({ onSuccess, autoFocus = false }: { onSuccess?: () => void; autoFocus?: boolean }) {
  const t = useTranslations("common");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const errorId = useId();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(false);
    const ok = await verifyAdmin(username, password);
    if (ok) {
      startAdminSession(username.trim().toLowerCase(), remember);
      setBusy(false);
      onSuccess?.();
      return;
    }
    // A short delay on failure blunts rapid guessing and reads as "we checked".
    await new Promise((resolve) => setTimeout(resolve, 600));
    setBusy(false);
    setError(true);
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Field label={t("login.username")}>
        {({ id }) => (
          <TextInput
            id={id}
            dir="ltr"
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus={autoFocus}
            aria-invalid={error || undefined}
            aria-describedby={error ? errorId : undefined}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        )}
      </Field>

      <Field label={t("login.password")}>
        {({ id }) => (
          <div className="relative">
            <TextInput
              id={id}
              type={showPassword ? "text" : "password"}
              dir="ltr"
              autoComplete="current-password"
              aria-invalid={error || undefined}
              aria-describedby={error ? errorId : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pe-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
              aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
              className="absolute inset-e-0 top-0 inline-flex h-12 w-12 items-center justify-center text-muted transition-colors hover:text-ink"
            >
              {showPassword ? (
                <EyeOff className="size-5" strokeWidth={1.25} aria-hidden />
              ) : (
                <Eye className="size-5" strokeWidth={1.25} aria-hidden />
              )}
            </button>
          </div>
        )}
      </Field>

      <Checkbox label={t("login.keep")} checked={remember} onChange={(e) => setRemember(e.target.checked)} />

      {error && (
        <p id={errorId} role="alert" className="text-[13px] leading-snug text-danger">
          {t("login.error")}
        </p>
      )}

      <Button type="submit" size="lg" block busy={busy}>
        {t("login.submit")}
      </Button>

      <p className="text-[13px] leading-snug text-muted">{t("login.demoNote")}</p>
    </form>
  );
}
