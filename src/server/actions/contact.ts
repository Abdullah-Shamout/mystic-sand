"use server";

import { z } from "zod";

import { normalizeKuwaitPhone, phoneStatus } from "@/lib/phone";
import { noNul } from "@/lib/validation";
import { getDb, schema } from "@/server/db";
import { logger, redactError } from "@/server/log";
import { clientIp, ipRateLimitKey } from "@/server/net/client-ip";
import { recordAndCheckContact } from "@/server/notify/contact-rate-limit";
import { getNotifier, safeNotify } from "@/server/notify/registry";

// The CONTACT SUBMISSION action. A "use server" export is a public POST endpoint, so this is an
// untrusted entry point. It mirrors lookupOrder's contract (src/server/actions/orders.ts): it returns a
// TYPED result and NEVER throws a user-visible message, derives the IP from clientIp() for the rate
// limiter, and sets no cookie.
//
// Shape:
//   • Count EVERY attempt against the per-IP throttle BEFORE validating, so a flood of malformed
//     submissions still trips it (fail-closed). No clear-on-success.
//   • Re-validate server-side the same way the form does (name 2..80, message 10..1000, a Kuwaiti
//     MOBILE) — the client check is UX, not a boundary.
//   • Persist to contact_messages, then fire a best-effort notification AFTER the insert via safeNotify
//     (a notification failure must never fail the submission).

export type SubmitContactResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "throttled" | "generic" };

// Mirrors the form's validate(): trimmed name 2..80, trimmed message 10..1000, locale en|ar. The phone
// is validated separately (phoneStatus) so a non-mobile is rejected exactly like the client does.
// name + message are persisted free text, so they also reject a NUL byte (\u0000), which zod passes but
// Postgres `text` throws on INSERT (noNul). phone is bounded (it was unbounded) before it is normalized.
const contactSchema = z.object({
  name: z.string().trim().min(2).max(80).refine(noNul),
  phone: z.string().max(32),
  message: z.string().trim().min(10).max(1000).refine(noNul),
  locale: z.enum(["en", "ar"]),
});

export async function submitContact(input: unknown): Promise<SubmitContactResult> {
  try {
    const ip = await clientIp();

    // Record + decide in one call, BEFORE validation, so every attempt counts (fail-closed). Bucket on
    // the NORMALIZED IP key (so IPv6 rotation inside a /64 can't dodge the limit); the row below still
    // STORES the full clientIp() for the record.
    if (recordAndCheckContact(ipRateLimitKey(ip))) return { ok: false, reason: "throttled" };

    const parsed = contactSchema.safeParse(input);
    if (!parsed.success) return { ok: false, reason: "invalid" };
    const { name, phone, message, locale } = parsed.data;

    // Require a Kuwaiti MOBILE (same rule as the checkout/contact forms); a landline / malformed number
    // is rejected. normalizeKuwaitPhone strips +965/00965/965 and punctuation to the bare 8 digits.
    if (phoneStatus(phone) !== "valid") return { ok: false, reason: "invalid" };
    const phoneE164 = `+965${normalizeKuwaitPhone(phone)}`;

    const db = getDb();
    const [row] = await db
      .insert(schema.contactMessages)
      .values({ name, phone: phoneE164, message, locale, ip })
      .returning({ id: schema.contactMessages.id });

    // Best-effort: the message is already persisted; a notification failure must not fail the submit.
    await safeNotify(() => getNotifier().contactReceived({ id: row.id, name, phoneE164, locale }));

    return { ok: true };
  } catch (error) {
    // Never leak an internal error to the client; a transient failure resolves to the generic reason.
    logger.error({ event: "contact_submit_failed", err: redactError(error) }, "submitContact failed");
    return { ok: false, reason: "generic" };
  }
}
