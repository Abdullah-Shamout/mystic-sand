import type { OrderStatus } from "@/server/db/schema";

// The SERVER seam between the storefront's order/contact lifecycle and a notification channel. One
// implementation per channel: today a log/no-op adapter (src/server/notify/log.ts); email / SMS /
// WhatsApp later. It mirrors the payment seam (src/server/payments/types.ts): an interface, an
// env-selected registry (registry.ts) and a `getNotifier()` accessor. Unlike payments, an unknown
// NOTIFIER falls back to the log adapter rather than throwing — a notification is best-effort and must
// never break the money/stock path that triggers it (see `safeNotify` in registry.ts).
//
// Payloads are MINIMAL on purpose: a notification carries only what a channel needs to address and
// reference the event — never the whole order/message row. A real email adapter would read any extra
// content it needs from the DB (the contact message is persisted; the order is persisted), so the
// payload stays a thin, PII-light envelope.

/** What a notification needs about an order. `oversold` is the POST-settle flag (a captured payment a
 * line could not be fulfilled), not the pre-settle order row's stale value. */
export type OrderNotification = {
  id: string;
  phoneE164: string;
  name: string;
  totalFils: number;
  oversold: boolean;
  locale: "en" | "ar";
};

/** What a notification needs about an inbound contact message (the body is persisted, not passed). */
export type ContactNotification = {
  id: string;
  name: string;
  phoneE164: string;
  locale: "en" | "ar";
};

export interface Notifier {
  /** A payment captured and the order was settled (paid, possibly oversold). Fired AFTER commit. */
  orderPaid(order: OrderNotification): Promise<void>;
  /** An order moved between lifecycle states (e.g. an admin marking it fulfilled). Unwired today. */
  orderStatusChanged(order: OrderNotification, from: OrderStatus, to: OrderStatus): Promise<void>;
  /** A guest submitted the contact form. Fired AFTER the row is persisted. */
  contactReceived(msg: ContactNotification): Promise<void>;
}
