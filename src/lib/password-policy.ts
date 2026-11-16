// Shared password policy for the admin account. Pure (no "server-only" / "client-only"), so the
// client checklist (settings/account-section.tsx) and the server-side changePassword action
// (server/actions/auth.ts) agree on exactly one rule set — the UI never says "OK" for a password
// the server will reject.

/** Minimum length for a new admin password. */
export const PASSWORD_MIN_LENGTH = 10;

/** Strong-password rules, each a boolean for the live checklist. */
export type PasswordChecks = {
  length: boolean;
  upper: boolean;
  number: boolean;
  special: boolean;
};

export function passwordChecks(password: string): PasswordChecks {
  return {
    length: password.length >= PASSWORD_MIN_LENGTH,
    upper: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
}

/** True when `password` meets every rule (length + capital + number + special). */
export const passwordIsStrong = (password: string): boolean =>
  Object.values(passwordChecks(password)).every(Boolean);
