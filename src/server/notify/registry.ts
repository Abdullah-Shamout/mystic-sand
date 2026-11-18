import "server-only";

import { site } from "@/data/site";
import { logger, redactError } from "@/server/log";

import { logNotifier } from "./log";
import { createResendNotifier } from "./resend";
import type { Notifier } from "./types";

// Env-selected notification adapter, mirroring src/server/payments/registry.ts. The one DELIBERATE
// difference from the payment registry: an unknown NOTIFIER FALLS BACK to the log adapter instead of
// throwing. A payment provider typo must fail loudly (money); a notification channel must never be able
// to break the order/contact flow that triggers it, so the seam is fail-safe end to end.

/**
 * Normalizes the effective notifier name from an env-shaped object. Pure: reads only the object passed
 * in (defaulting to process.env). An empty string is treated as unset, so both an absent and a blank
 * value resolve to the "log" default.
 */
export function resolveNotifierName(
  env: { [key: string]: string | undefined } = process.env,
): string {
  return (env.NOTIFIER ?? "").trim() || "log";
}

/**
 * The resend adapter, resolved once per process. If NOTIFIER=resend but RESEND_API_KEY / RESEND_FROM is
 * missing it FALLS BACK to the log adapter and logs ONE error (`next build` and CI run with no key, so
 * this must never throw). Memoized so the misconfig is logged at most once, not per order. `undefined`
 * means "not yet resolved this process".
 */
let resendAdapter: Notifier | undefined;

function resolveResendNotifier(): Notifier {
  if (resendAdapter) return resendAdapter;
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!apiKey || !from) {
    // Fail-safe + fail-visible: fall back to the log adapter, but page the operator ONCE at boot so a
    // misconfigured production (NOTIFIER=resend with no key/from) is not silently sending nothing.
    logger.error(
      { event: "notify_resend_misconfigured", hasKey: Boolean(apiKey), hasFrom: Boolean(from) },
      "NOTIFIER=resend but RESEND_API_KEY/RESEND_FROM is missing — falling back to the log adapter",
    );
    resendAdapter = logNotifier;
    return resendAdapter;
  }
  const ownerEmail = process.env.OWNER_NOTIFY_EMAIL?.trim() || site.email;
  resendAdapter = createResendNotifier({ apiKey, from, ownerEmail });
  return resendAdapter;
}

/** Test-only: forget the memoized resend resolution so a test can re-resolve under new env. */
export function __resetNotifierRegistryForTest(): void {
  resendAdapter = undefined;
}

/**
 * Resolves the active notification adapter from `process.env.NOTIFIER` (default "log"). An unknown
 * value falls back to the log adapter (fail-safe) — a notification must never break its caller.
 */
export function getNotifier(): Notifier {
  const name = resolveNotifierName();
  switch (name) {
    case "log":
      return logNotifier;
    case "resend":
      return resolveResendNotifier();
    default:
      // Fail-safe: an unrecognized channel degrades to the log adapter rather than throwing.
      return logNotifier;
  }
}

/**
 * Runs a notifier call so a failure NEVER breaks the caller. The notification is best-effort: the
 * money/stock mutation (or the persisted contact row) is already committed by the time this runs, so a
 * channel error is logged (via `redactError`, never raw) and swallowed. Always `await` it so a rejected
 * promise is caught here rather than surfacing as an unhandled rejection.
 */
export async function safeNotify(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    logger.error({ event: "notify_failed", err: redactError(error) }, "notification delivery failed");
  }
}
