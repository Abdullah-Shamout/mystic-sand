import "server-only";

import { logger, redactError } from "@/server/log";

import { logNotifier } from "./log";
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
 * Resolves the active notification adapter from `process.env.NOTIFIER` (default "log"). An unknown
 * value falls back to the log adapter (fail-safe) — a notification must never break its caller.
 */
export function getNotifier(): Notifier {
  const name = resolveNotifierName();
  switch (name) {
    case "log":
      return logNotifier;
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
