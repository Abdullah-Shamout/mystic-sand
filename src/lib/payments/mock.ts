import type { PaymentGateway, PaymentRecord, PaymentResult } from "./types";

const RESULTS: PaymentResult[] = ["CAPTURED", "NOT CAPTURED", "CANCELED", "PENDING"];

/** Simulated gateway: sends the shopper to the in-site KNET/card simulator. */
export const mockGateway: PaymentGateway = {
  initiate({ orderId, method }) {
    const q = new URLSearchParams({ order: orderId, method });
    return { redirectPath: `/checkout/pay?${q.toString()}` };
  },

  // Same parameter names KNET returns to a merchant's response URL.
  resultPath(record: PaymentRecord, orderId: string) {
    const q = new URLSearchParams({
      order: orderId,
      paymentid: record.paymentId,
      result: record.result,
      trackid: record.trackId,
      tranid: record.tranId ?? "",
      ref: record.ref ?? "",
      auth: record.auth ?? "",
      postdate: record.postDate,
      amt: (record.amountFils / 1000).toFixed(3),
    });
    return `/checkout/result?${q.toString()}`;
  },

  parseResult(params) {
    const result = params.get("result");
    return {
      orderId: params.get("order"),
      result: RESULTS.includes(result as PaymentResult) ? (result as PaymentResult) : null,
      paymentId: params.get("paymentid"),
    };
  },
};
