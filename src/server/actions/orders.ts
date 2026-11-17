"use server";

import { toLatinDigits } from "@/lib/digits";
import { normalizeKuwaitPhone, phoneStatus } from "@/lib/phone";
import { logger, redactError } from "@/server/log";
import { clientIp } from "@/server/net/client-ip";
import { recordAndCheckLookup } from "@/server/orders/lookup-rate-limit";
import { lookupPaidOrder, type LookupOrderView } from "@/server/read/order-lookup";

// The GUEST ORDER LOOKUP action. A "use server" export is a public POST endpoint, so this is an
// order/money/IDOR-sensitive surface. It mirrors initiateCheckout's contract: it returns a TYPED
// result and NEVER throws a user-visible message (a production build redacts thrown action messages),
// and it sets NO cookie (unlike the checkout-token flow — a cross-device lookup grants no ownership).
//
// Security shape:
//   • Count EVERY attempt against the target-keyed throttle BEFORE answering, so neither a wrong phone
//     nor an unknown id can be probed for free (no clear-on-success anywhere).
//   • unknown-id and wrong-phone are IDENTICAL ("notfound") — lookupPaidOrder matches id AND phone AND
//     status='paid' in one query, so nothing distinguishes "no such order" from "not your order".
//   • An un-parseable phone / malformed number is treated as not-found, but the attempt still counts.

export type LookupOrderResult =
  | { ok: true; order: LookupOrderView }
  | { ok: false; reason: "notfound" | "throttled" };

const MAX_NUMBER_LEN = 40;
/** The exact minted id shape: "MS-" + the ms_order_seq value (5..10 digits in practice; allow 4..10). */
const MS_NUMBER_RE = /^MS-\d{4,10}$/;

export async function lookupOrder(input: unknown): Promise<LookupOrderResult> {
  try {
    const raw = (input ?? {}) as { number?: unknown; phone?: unknown };
    const rawNumber = typeof raw.number === "string" ? raw.number : "";
    const rawPhone = typeof raw.phone === "string" ? raw.phone : "";

    // Normalize the number the way the id is minted: convert Arabic-Indic digits FIRST (so the throttle
    // key and the query value are identical for a non-browser client), then trim, uppercase, length-cap,
    // and require the exact MS-<digits> shape.
    const number = toLatinDigits(rawNumber).trim().toUpperCase().slice(0, MAX_NUMBER_LEN);
    const numberValid = MS_NUMBER_RE.test(number);

    // Validate the phone with the SAME rule the checkout form uses (phoneStatus === "valid").
    const phoneValid = phoneStatus(rawPhone) === "valid";
    const normalizedPhone = phoneValid ? normalizeKuwaitPhone(rawPhone) : "";

    const ip = await clientIp();

    // Record the attempt and get the throttle decision in one call. Keys are built ONLY from validated
    // values (an un-parseable phone / number is skipped on its axis but the attempt still counts on the
    // IP axis). Fail-closed is handled inside the limiter.
    const throttled = recordAndCheckLookup({
      phone: phoneValid ? normalizedPhone : undefined,
      orderId: numberValid ? number : undefined,
      ip,
    });
    if (throttled) return { ok: false, reason: "throttled" };

    // A malformed number or phone is not-found (but was already counted above).
    if (!numberValid || !phoneValid) return { ok: false, reason: "notfound" };

    const order = await lookupPaidOrder(number, `+965${normalizedPhone}`);
    return order ? { ok: true, order } : { ok: false, reason: "notfound" };
  } catch (error) {
    // Never leak an internal error to the client; a transient failure resolves to the generic
    // not-found (the attempt, if we reached the limiter, was already recorded).
    logger.error({ event: "order_lookup_failed", err: redactError(error) }, "lookupOrder failed");
    return { ok: false, reason: "notfound" };
  }
}
