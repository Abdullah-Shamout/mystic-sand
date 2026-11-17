import "server-only";

import { logger } from "@/server/log";

import type { ContactNotification, Notifier, OrderNotification } from "./types";

// The default no-op notification adapter: it emits a structured `logger.info` event per notification
// and does nothing else. It is the fail-safe fallback (an unknown or unset NOTIFIER resolves here) and
// the stand-in until a real email / SMS / WhatsApp adapter exists.
//
// A09 — log ONLY non-PII identifiers. The order id (MS-#####) and the contact id (a uuid) are opaque
// handles, not personal data; the status and oversold flag are not either. We deliberately do NOT log
// the customer name, phone or message: a real channel adapter would carry that content to the provider,
// but it must never land in the application log (the message is already persisted in the DB; the order
// row holds the rest). Each method is `async` and never throws — `safeNotify` guards the call anyway.

export const logNotifier: Notifier = {
  async orderPaid(order: OrderNotification): Promise<void> {
    logger.info({ event: "notify_order_paid", orderId: order.id, oversold: order.oversold }, "notify: order paid");
  },

  async orderStatusChanged(order: OrderNotification, from, to): Promise<void> {
    logger.info(
      { event: "notify_order_status_changed", orderId: order.id, from, to },
      "notify: order status changed",
    );
  },

  async contactReceived(msg: ContactNotification): Promise<void> {
    logger.info({ event: "notify_contact_received", contactId: msg.id, locale: msg.locale }, "notify: contact received");
  },
};
