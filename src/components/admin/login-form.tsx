"use client";

import { Eye, EyeOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, TextInput } from "@/components/ui/form";
import { login } from "@/server/actions/auth";

type Locale = "en" | "ar";

/**
 * Admin sign-in form (used by the /login page and the header login dialog). Submits to the `login`
 * Server Action, which verifies the password (argon2), sets the httpOnly session cookie and returns a
 * safe same-site redirect. On success we hard-navigate there so the new cookie is sent with the next
 * request. Every failure (bad credentials or a lockout) shows the same generic message.
 */
export function LoginForm({
  onSuccess,
  autoFocus = false,
  next,
}: {
  onSuccess?: () => void;
  autoFocus?: boolean;
  next?: string;
}) {
  const t = useTranslations("common");
  const locale = useLocale() as Locale;
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
    try {
      const result = await login({ username, password, remember, next, locale });
      if (result.ok) {
        onSuccess?.();
        // Hard navigation so the just-set session cookie is sent with the next request.
        window.location.assign(result.redirect);
        return; // stay busy; the page is navigating away
      }
    } catch {
      // fall through to the generic error
    }
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
            data-testid="login-username"
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
              data-testid="login-password"
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

      <Button type="submit" size="lg" block busy={busy} data-testid="login-submit">
        {t("login.submit")}
      </Button>
    </form>
  );
}
