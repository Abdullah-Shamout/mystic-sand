import "server-only";

import { eq } from "drizzle-orm";

import { areaById, governorates } from "@/data/kuwait-areas";
import { site } from "@/data/site";
import type { Locale } from "@/i18n/routing";
import { formatAmount, formatKWD } from "@/lib/money";
import { formatKuwaitPhone } from "@/lib/phone";
import { getDb, schema } from "@/server/db";
import { logger, redactError } from "@/server/log";
import { toLookupView, type LookupOrderView } from "@/server/read/order-lookup";

import { logNotifier } from "./log";
import type { ContactNotification, Notifier, OrderNotification } from "./types";

// The Resend email notification adapter (Phase 6 notification seam → a real channel). It sends TWO
// emails on a settled payment: an OWNER alert (the first time an oversold capture reaches a human) and a
// CUSTOMER confirmation. It uses plain `fetch` against Resend's REST API — NO `resend` npm package, zero
// new dependencies. The endpoint host is hardcoded (no SSRF surface).
//
// Fail-safe like the whole seam: every send is wrapped so a provider/network error is logged (A09-safe)
// and swallowed; a notification must never break the already-committed settle that triggered it.
//
// LATENCY: each send is hard-bounded by a 5s AbortSignal.timeout and both legs run in parallel via
// Promise.allSettled, so a slow/unreachable Resend adds at most ~5s and one leg never blocks the other.
// settle.ts additionally defers this whole call past the HTTP response with Next's `after()` where it
// can, so in practice the shopper's result page and the webhook response are not blocked at all.
//
// A09 LOGGING: we log ONLY { event, orderId, leg, status } and, on a thrown send, redactError(error).
// We NEVER log the recipient address, the email body, or a provider error body (Resend's error message
// can echo the recipient address). redactError emits only the error name + a string code/constraint, so
// it is safe for a non-drizzle error too (confirmed: no message/detail/params ever pass through).
//
// PRODUCTION / Phase 9: sending to real customer addresses requires Resend DOMAIN VERIFICATION (SPF +
// DKIM DNS records on the from-domain). Until that is done, Resend's shared test sender
// (onboarding@resend.dev) only delivers to the Resend account owner's own email — so the customer leg to
// an arbitrary shopper address will NOT be delivered pre-verification. See .env.example (RESEND_FROM).

const RESEND_ENDPOINT = "https://api.resend.com/emails";
/** Hard per-send ceiling so an unbounded Resend latency can never hang the settle path. */
const SEND_TIMEOUT_MS = 5000;

export type ResendConfig = {
  /** Resend API key (server secret). */
  apiKey: string;
  /** The verified/from sender, e.g. "Mystic Sand <orders@mysticsandkw.com>" or "onboarding@resend.dev". */
  from: string;
  /** Where the owner alert is sent (env OWNER_NOTIFY_EMAIL, defaulting to the site business email). */
  ownerEmail: string;
};

type OrderRow = typeof schema.orders.$inferSelect;
type OrderLineRow = typeof schema.orderLines.$inferSelect;

/** Loads the full order + its lines by id. Injectable so unit tests need no database. */
export type OrderLoader = (orderId: string) => Promise<{ order: OrderRow; lines: OrderLineRow[] } | null>;

export type ResendDeps = {
  /** Defaults to the global fetch; injected in unit tests. */
  fetchImpl?: typeof fetch;
  /** Defaults to a DB read; injected in unit tests. */
  loadOrder?: OrderLoader;
};

type EmailMessage = { subject: string; html: string; text: string };

/** Escapes EVERY shopper-typed interpolation before it lands in an HTML email body. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Collapses whitespace/newlines to a single space. The owner PLAINTEXT part is line-structured (one
 * "Label: value" per line, ending in "Total: …"), and the checkout schema blocks only NUL — so a
 * newline in a free-text field (name/address/notes/maps) could otherwise forge an extra line such as a
 * fake "Total: KWD 999.000". Applied to shopper free-text in the TEXT part only; the HTML part is immune
 * (escaped + newlines collapse in rendering).
 */
const oneLine = (value: string): string => value.replace(/\s+/g, " ").trim();

/** Default loader: one order row + its lines, server-only. */
async function loadOrderFromDb(orderId: string): Promise<{ order: OrderRow; lines: OrderLineRow[] } | null> {
  const db = getDb();
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId)).limit(1);
  if (!order) return null;
  const lines = await db.select().from(schema.orderLines).where(eq(schema.orderLines.orderId, orderId));
  return { order, lines };
}

// ── Localized customer copy (mirrors messages/*/payment.json success + summary + methods) ────────────

const COPY = {
  en: {
    heading: "Thank you",
    confirmed: (id: string) => `Your order ${id} is confirmed`,
    confirmedHtml: (idHtml: string) => `Your order ${idHtml} is confirmed`,
    text: "Your payment has been received, and your order is being prepared with care.",
    summaryTitle: "Order summary",
    qty: (n: number) => `Qty ${n}`,
    subtotal: "Subtotal",
    discount: "Discount",
    delivery: "Delivery",
    total: "Total",
    paidWith: (m: string) => `Paid with ${m}`,
    methods: { knet: "KNET", card: "Card", applepay: "Apple Pay" } as Record<string, string>,
    footer: "Questions about your order? Just reply to this email or message us on WhatsApp.",
  },
  ar: {
    heading: "شكراً لك",
    confirmed: (id: string) => `تم تأكيد طلبك ${id}`,
    confirmedHtml: (idHtml: string) => `تم تأكيد طلبك ${idHtml}`,
    text: "استلمنا دفعتك، ونجهّز طلبك الآن بكل عناية.",
    summaryTitle: "ملخص الطلب",
    qty: (n: number) => `الكمية: ${n}`,
    subtotal: "المجموع الفرعي",
    discount: "الخصم",
    delivery: "التوصيل",
    total: "الإجمالي",
    paidWith: (m: string) => `تم الدفع عبر ${m}`,
    methods: { knet: "كي نت", card: "بطاقة", applepay: "Apple Pay" } as Record<string, string>,
    footer: "لأي استفسار عن طلبك، يمكنك الرد على هذا البريد أو مراسلتنا عبر واتساب.",
  },
} as const;

function htmlDocument(dir: "ltr" | "rtl", lang: Locale, inner: string): string {
  const align = dir === "rtl" ? "right" : "left";
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"></head>` +
    `<body style="margin:0;background:#f4f1ea;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1c1c;">` +
    `<div style="max-width:560px;margin:0 auto;padding:24px;text-align:${align};">${inner}</div>` +
    `</body></html>`;
}

/** The shared order-summary rows (items + totals), used by the customer email. All values escaped. */
function summaryHtml(view: LookupOrderView): string {
  const c = COPY[view.locale];
  const money = (fils: number) => escapeHtml(formatKWD(fils, view.locale));
  const rows = view.lines
    .map((l) => {
      const title = escapeHtml(`${l.name} · ${l.size[view.locale]}`);
      return `<tr><td style="padding:8px 0;border-bottom:1px solid #e3ddd0;">${title}<br><span style="color:#6b6b6b;font-size:13px;">${escapeHtml(c.qty(l.qty))}</span></td>` +
        `<td style="padding:8px 0;border-bottom:1px solid #e3ddd0;white-space:nowrap;" align="${view.locale === "ar" ? "left" : "right"}">${money(l.priceFils * l.qty)}</td></tr>`;
    })
    .join("");
  const t = view.totals;
  const totalRow = (label: string, fils: number, strong = false) =>
    `<tr><td style="padding:4px 0;${strong ? "font-weight:600;" : "color:#6b6b6b;"}">${escapeHtml(label)}</td>` +
    `<td style="padding:4px 0;white-space:nowrap;${strong ? "font-weight:600;" : ""}" align="${view.locale === "ar" ? "left" : "right"}">${money(fils)}</td></tr>`;
  const totals =
    totalRow(c.subtotal, t.subtotalFils) +
    (t.discountFils > 0 ? totalRow(c.discount, -t.discountFils) : "") +
    totalRow(c.delivery, t.deliveryFils) +
    totalRow(c.total, t.totalFils, true);
  return `<h2 style="font-size:16px;margin:24px 0 8px;">${escapeHtml(c.summaryTitle)}</h2>` +
    `<table width="100%" style="border-collapse:collapse;font-size:14px;">${rows}</table>` +
    `<table width="100%" style="border-collapse:collapse;font-size:14px;margin-top:12px;">${totals}</table>`;
}

/** The CUSTOMER confirmation, built ONLY from the reduced projection (no name, phone, address or refs). */
export function buildCustomerEmail(view: LookupOrderView): EmailMessage {
  const c = COPY[view.locale];
  const dir = view.locale === "ar" ? "rtl" : "ltr";
  const method = c.methods[view.method] ?? view.method;
  const idHtml = `<span dir="ltr" style="font-weight:600;">${escapeHtml(view.id)}</span>`;

  const inner =
    `<p style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#004225;margin:0 0 4px;">${escapeHtml(site.brand)}</p>` +
    `<h1 style="font-size:24px;margin:0 0 8px;">${escapeHtml(c.heading)}</h1>` +
    `<p style="font-size:16px;margin:0 0 4px;">${c.confirmedHtml(idHtml)}</p>` +
    `<p style="color:#6b6b6b;margin:0 0 8px;">${escapeHtml(c.text)}</p>` +
    summaryHtml(view) +
    `<p style="margin:16px 0 0;color:#6b6b6b;font-size:13px;">${escapeHtml(c.paidWith(method))}</p>` +
    `<p style="margin:16px 0 0;color:#6b6b6b;font-size:13px;">${escapeHtml(c.footer)}</p>`;

  const lineText = view.lines
    .map((l) => `- ${l.name} · ${l.size[view.locale]} × ${l.qty} — ${formatKWD(l.priceFils * l.qty, view.locale)}`)
    .join("\n");
  const t = view.totals;
  const text = [
    site.brand,
    "",
    `${c.confirmed(view.id)}`,
    c.text,
    "",
    c.summaryTitle,
    lineText,
    "",
    `${c.subtotal}: ${formatKWD(t.subtotalFils, view.locale)}`,
    ...(t.discountFils > 0 ? [`${c.discount}: ${formatKWD(-t.discountFils, view.locale)}`] : []),
    `${c.delivery}: ${formatKWD(t.deliveryFils, view.locale)}`,
    `${c.total}: ${formatKWD(t.totalFils, view.locale)}`,
    "",
    c.paidWith(method),
    c.footer,
  ].join("\n");

  return { subject: c.confirmed(view.id), html: htmlDocument(dir, view.locale, inner), text };
}

/** The OWNER alert (business-facing, English). Subject carries the id + total; the OVERSOLD flag is
 * marked in the subject so a captured-but-unfulfillable order pages a human immediately. */
export function buildOwnerEmail(order: OrderNotification, row: OrderRow, lines: OrderLineRow[]): EmailMessage {
  const money = (fils: number) => formatKWD(fils, "en");
  const totalPlain = `${formatAmount(order.totalFils)} KWD`;
  const subject = order.oversold
    ? `⚠ OVERSOLD — New order ${order.id} — ${totalPlain}`
    : `New order ${order.id} — ${totalPlain}`;

  const d = row.details;
  const area = d.areaId ? areaById(d.areaId) : undefined;
  const areaLine = area ? `${area.name.en} · ${governorates[area.governorate].en}` : (d.areaId ?? "");
  const addressParts = [
    d.block && `Block ${d.block}`,
    d.street && `Street ${d.street}`,
    d.avenue && `Avenue ${d.avenue}`,
    d.building && `${d.housing === "house" ? "House" : "Building"} ${d.building}`,
    d.housing !== "house" && d.floor && `Floor ${d.floor}`,
    d.housing !== "house" && d.apartment && `${d.housing === "office" ? "Office" : "Apt."} ${d.apartment}`,
  ].filter(Boolean) as string[];

  const kv = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#6b6b6b;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>` +
    `<td style="padding:4px 0;vertical-align:top;">${escapeHtml(value)}</td></tr>`;

  const itemsHtml = lines
    .map(
      (l) =>
        `<tr><td style="padding:6px 0;border-bottom:1px solid #e3ddd0;">${escapeHtml(`${l.name} · ${l.size.en}`)} × ${l.qty}</td>` +
        `<td style="padding:6px 0;border-bottom:1px solid #e3ddd0;white-space:nowrap;" align="right">${escapeHtml(money(l.priceFils * l.qty))}</td></tr>`,
    )
    .join("");

  const warning = order.oversold
    ? `<p style="background:#fbeaea;border:1px solid #d99;color:#8a1f1f;padding:10px 12px;margin:0 0 16px;font-weight:600;">` +
      `⚠ OVERSOLD — a captured payment could not be fully fulfilled. Refund or restock, then contact the customer.</p>`
    : "";

  const contact = [
    // Defensive coalesce/guard: buildOwnerEmail runs OUTSIDE sendEmail's try/catch, so an escapeHtml/
    // formatKuwaitPhone throw on a seeded/partial details row (missing name/phone) would drop BOTH legs.
    // Real checkout rows have name/phone (schema-required); this only mirrors the adapter's `email ?? ""`.
    kv("Name", d.name ?? ""),
    kv("Phone", d.phone ? formatKuwaitPhone(d.phone) : ""),
    d.email ? kv("Email", d.email) : "",
    kv("Area", areaLine),
    addressParts.length ? kv("Address", addressParts.join(", ")) : "",
    d.mapsLink ? kv("Maps", d.mapsLink) : "",
    d.notes ? kv("Notes", d.notes) : "",
    kv("Payment", `${(COPY.en.methods[row.method] ?? row.method)} · ${order.locale.toUpperCase()}`),
  ].join("");

  const inner =
    warning +
    `<h1 style="font-size:20px;margin:0 0 4px;">New order <span dir="ltr">${escapeHtml(order.id)}</span></h1>` +
    `<p style="color:#6b6b6b;margin:0 0 16px;">${escapeHtml(money(order.totalFils))} total</p>` +
    `<table style="border-collapse:collapse;font-size:14px;margin:0 0 16px;">${contact}</table>` +
    `<h2 style="font-size:16px;margin:0 0 8px;">Items</h2>` +
    `<table width="100%" style="border-collapse:collapse;font-size:14px;">${itemsHtml}</table>` +
    `<p style="margin:12px 0 0;font-weight:600;">Total: ${escapeHtml(money(order.totalFils))}</p>`;

  const textLines = [
    order.oversold ? "** OVERSOLD — a captured payment could not be fully fulfilled. Refund/restock, then contact the customer. **" : "",
    `New order ${order.id} — ${money(order.totalFils)}`,
    "",
    // Guard name/phone (Fix 2) and collapse newlines in EVERY shopper free-text field (Fix 4) so none can
    // forge an extra line (e.g. a fake "Total: …") in this line-structured plaintext part. Email is z.email
    // (no whitespace) and only present when set; the HTML part needs no collapsing (escaped).
    `Name: ${oneLine(d.name ?? "")}`,
    `Phone: ${d.phone ? formatKuwaitPhone(d.phone) : ""}`,
    d.email ? `Email: ${d.email}` : "",
    `Area: ${oneLine(areaLine)}`,
    addressParts.length ? `Address: ${oneLine(addressParts.join(", "))}` : "",
    d.mapsLink ? `Maps: ${oneLine(d.mapsLink)}` : "",
    d.notes ? `Notes: ${oneLine(d.notes)}` : "",
    `Payment: ${COPY.en.methods[row.method] ?? row.method} · ${order.locale.toUpperCase()}`,
    "",
    "Items:",
    ...lines.map((l) => `- ${l.name} · ${l.size.en} × ${l.qty} — ${money(l.priceFils * l.qty)}`),
    "",
    `Total: ${money(order.totalFils)}`,
  ].filter((line) => line !== "");

  return { subject, html: htmlDocument("ltr", "en", inner), text: textLines.join("\n") };
}

/** One send leg: bounded by a 5s timeout, self-logging, never throws out (so allSettled always settles). */
async function sendEmail(
  cfg: ResendConfig,
  fetchImpl: typeof fetch,
  orderId: string,
  leg: "owner" | "customer",
  to: string,
  msg: EmailMessage,
  replyTo?: string,
): Promise<void> {
  try {
    const res = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      // Resend's REST field is `reply_to` (snake_case). Set it only when provided; omit it otherwise.
      body: JSON.stringify({
        from: cfg.from,
        to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    // Resend's REST API signals an API error with a NON-2xx status (its body is { name, message,
    // statusCode }); it does not throw. Treat any non-2xx as a FAILED leg and never read/log that body
    // (it can echo the recipient address — A09). On 2xx the body is { id }.
    if (!res.ok) {
      logger.error({ event: "notify_resend_failed", orderId, leg, status: res.status }, "resend send failed");
      return;
    }
    logger.info({ event: "notify_resend_sent", orderId, leg, status: "ok" }, "resend send ok");
  } catch (error) {
    // Network/DNS failure or the 5s AbortSignal.timeout firing. redactError emits only the error name +
    // a string code (e.g. "TimeoutError") — never a message, address or body.
    logger.error({ event: "notify_resend_failed", orderId, leg, err: redactError(error) }, "resend send threw");
  }
}

/** Builds a Resend-backed Notifier. `deps` lets unit tests inject fetch + the order loader. */
export function createResendNotifier(cfg: ResendConfig, deps: ResendDeps = {}): Notifier {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const loadOrder = deps.loadOrder ?? loadOrderFromDb;

  return {
    async orderPaid(order: OrderNotification): Promise<void> {
      const loaded = await loadOrder(order.id);
      if (!loaded) {
        logger.error({ event: "notify_resend_no_order", orderId: order.id }, "resend: order not found for notification");
        return;
      }
      const { order: row, lines } = loaded;

      const ownerMsg = buildOwnerEmail(order, row, lines);
      const legs: Promise<void>[] = [sendEmail(cfg, fetchImpl, order.id, "owner", cfg.ownerEmail, ownerMsg)];

      const customerTo = (row.details.email ?? "").trim();
      if (customerTo) {
        const customerMsg = buildCustomerEmail(toLookupView(row, lines));
        // The customer footer says "reply to this email" — route replies to the owner inbox, not the
        // (pre-domain-verification / unmonitored) RESEND_FROM sender. The owner leg needs no reply_to.
        legs.push(sendEmail(cfg, fetchImpl, order.id, "customer", customerTo, customerMsg, cfg.ownerEmail));
      } else {
        // Seeded rows / reconcile-settled pendings can carry no email — skip the customer leg entirely;
        // the owner leg always sends. (A09: there is no recipient to omit from the log.)
        logger.info(
          { event: "notify_resend_skipped", orderId: order.id, leg: "customer", status: "no_email" },
          "resend: no customer email on file — owner only",
        );
      }

      // Both legs in parallel, each already hard-bounded by its own 5s timeout; allSettled so one leg's
      // latency/failure never affects the other and neither can reject out of here.
      await Promise.allSettled(legs);
    },

    // The contact endpoint is public + XFF-keyed until Phase 9, so emailing on contact could burn the
    // 100/day quota and starve order emails — delegate to the log adapter (no email). orderStatusChanged
    // is unwired today; keep the log behavior.
    orderStatusChanged: logNotifier.orderStatusChanged,
    contactReceived: (msg: ContactNotification) => logNotifier.contactReceived(msg),
  };
}
