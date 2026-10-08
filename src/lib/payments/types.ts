import type { PaymentMethod } from "@/data/site";

export type { PaymentMethod };

/** KNET result values (plus PENDING when the bank confirms late). */
export type PaymentResult = "CAPTURED" | "NOT CAPTURED" | "CANCELED" | "PENDING";

/** Mirrors the fields a KNET response carries back to the merchant. */
export type PaymentRecord = {
  method: PaymentMethod;
  result: PaymentResult;
  paymentId: string;
  trackId: string;
  tranId?: string;
  ref?: string;
  auth?: string;
  postDate: string; // MMDD
  amountFils: number;
  bankId?: string;
  at: string; // ISO timestamp
};

/**
 * The seam between the storefront and a payment provider.
 *
 * Prototype: `mockGateway` (./mock.ts) routes to the in-site simulator.
 *
 * Production (MyFatoorah / Tap / UPayments / Hesabe / Ottu, or bank-direct KNET):
 *  1. `initiate` becomes a call to YOUR server route, which creates the payment
 *     with the provider (amount, trackid, return URLs) and returns the provider's
 *     hosted-page URL. The shopper types card number, PIN and the bank's SMS code
 *     on KNET's page — never on this site.
 *  2. The provider redirects back to /checkout/result. Treat those query params as
 *     untrusted: the server must confirm the status with the provider (inquiry API
 *     or webhook) before marking the order paid.
 */
export interface PaymentGateway {
  initiate(input: { orderId: string; method: Exclude<PaymentMethod, "applepay">; amountFils: number }): {
    /** Path inside the site (locale prefix is added by the router). */
    redirectPath: string;
  };
  resultPath(record: PaymentRecord, orderId: string): string;
  parseResult(params: URLSearchParams): {
    orderId: string | null;
    result: PaymentResult | null;
    paymentId: string | null;
  };
}
