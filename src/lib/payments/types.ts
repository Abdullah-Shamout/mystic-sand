import type { PaymentMethod } from "@/data/site";

export type { PaymentMethod };

/**
 * KNET-style result values. "PENDING" is no longer produced (the "confirming" flow was removed); it
 * is kept in the union only so attempts stored by older builds still type-check and render.
 */
export type PaymentResult = "CAPTURED" | "NOT CAPTURED" | "CANCELED" | "PENDING";

/**
 * The receipt shape the result page, the invoice and the admin dashboard render. It mirrors the
 * fields a KNET response carries back to the merchant; the server read layer (src/server/read/
 * orders.ts) maps a `payment_attempts` row into this shape. The live payment SEAM is the SERVER
 * gateway now (src/server/payments) — the in-browser simulator is gone.
 */
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
