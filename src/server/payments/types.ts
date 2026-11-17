import type { PaymentMethod } from "@/data/site";

export type { PaymentMethod };

/**
 * Settlement result recorded on a payment attempt. Mirrors `schema.PaymentResult`
 * (src/server/db/schema.ts) and the `payment_attempts.result` column CHECK set exactly, so a
 * VerifyResult drops straight into a row later (Phase 5b) without a remap.
 */
export type PaymentResult = "CAPTURED" | "NOT CAPTURED" | "CANCELED";

/**
 * Input to {@link PaymentGateway.initiate}.
 *
 * `origin` is the absolute site origin ("scheme://host", no trailing slash) that the CALLER derives
 * from the request headers (host + x-forwarded-proto) and passes in. This keeps `next/headers` — and
 * its request-scope / Edge constraints — out of the adapters: an adapter is a plain async function,
 * not a request-bound one. `returnUrl` must likewise be an ABSOLUTE URL the provider redirects back
 * to after the shopper finishes.
 */
export type InitiateInput = {
  orderId: string;
  amountFils: number;
  currency: "KWD";
  method: PaymentMethod;
  locale: "en" | "ar";
  returnUrl: string;
  origin: string;
};

export type InitiateResult = {
  /** Absolute URL to send the shopper to (the provider's hosted page). */
  redirectUrl: string;
  /** The provider's id for this payment; UNIQUE(provider, providerPaymentId) in the DB. */
  providerPaymentId: string;
};

/**
 * The confirmed outcome of a payment, read back from the provider (return-url inquiry or webhook).
 * Field names align with the `payment_attempts` columns so a row write is a direct copy.
 */
export type VerifyResult = {
  providerPaymentId: string;
  result: PaymentResult;
  amountFils: number;
  currency: string;
  trackId?: string;
  tranId?: string;
  ref?: string;
  auth?: string;
  bankId?: string;
  raw?: Record<string, unknown>;
};

export type WebhookResult =
  | { ok: true; verify: VerifyResult }
  | { ok: false; reason: string };

/**
 * The SERVER seam between the storefront and a payment provider. One implementation per provider
 * (sandbox today; a real KWD gateway later). Unlike the client `lib/payments` seam, this never runs
 * in the browser: the shopper enters card details only on the provider's own page.
 */
export interface PaymentGateway {
  /** Stable provider key, stored in `payment_attempts.provider`. */
  readonly provider: string;
  /**
   * How long (ms) a payment session can still be verified after it is created. The stale-pending
   * reconciler uses this as the HARD FLOOR on its cutoff: an order younger than this may still have a
   * shopper on the provider's page (verify returns null meanwhile), so force-cancelling it could drop
   * a capture that is about to land.
   */
  readonly sessionLifetimeMs: number;
  /** Create the payment with the provider and return where to send the shopper. */
  initiate(input: InitiateInput): Promise<InitiateResult>;
  /**
   * Confirm an outcome with the provider. Returns `null` ONLY when the provider positively confirms
   * there is NO decision yet (the payment was never decided) — never on a transport/API error. A
   * network failure, timeout, HTTP 404 or any other transient/ambiguous error MUST THROW, not return
   * null: the stale-pending reconciler treats null as "no capture, safe to cancel" but SKIPS on a
   * throw, so an adapter that returned null on a 404/timeout would make reconcile cancel a paid order.
   */
  verify(ref: { providerPaymentId: string }): Promise<VerifyResult | null>;
  /** Authenticate + parse a provider webhook. Treat the request as untrusted. */
  parseWebhook(request: Request): Promise<WebhookResult>;
}
