import { revalidateTag } from "next/cache";

import { settleChangedStock, settleOrder } from "@/server/orders/settle";
import { logger } from "@/server/log";
import { getGateway } from "@/server/payments/registry";

// POST /api/payments/<provider>/webhook/ — the provider's server-to-server settlement callback.
//
// It authenticates + parses the request through the active gateway (parseWebhook treats it as
// untrusted), then settles the order. settleOrder is idempotent, so a webhook that races the
// shopper's return URL decrements stock exactly once. A capture expires the storefront catalog cache
// here (revalidateTag is allowed in a Route Handler; updateTag is not).
//
// Response contract:
//   • A misconfigured provider, a forged/invalid signature, or a benign malformed/unbound body → 200,
//     so the provider stops retrying something that can never succeed (and a forged flood can't DoS us).
//   • A VALID, authenticated webhook whose settle THROWS (a transient DB/lock failure on a real
//     payment) → 500, so the provider RETRIES rather than us silently dropping the settle (fail-open).
// Runs only at request time, never at build.

function ack(): Response {
  return new Response(null, { status: 200 });
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/payments/[provider]/webhook">,
): Promise<Response> {
  const { provider } = await ctx.params;

  let gateway;
  try {
    gateway = getGateway();
  } catch {
    return ack(); // misconfigured PAYMENT_PROVIDER — ack rather than loop the provider's retries
  }
  if (gateway.provider !== provider) return ack();

  let parsed;
  try {
    parsed = await gateway.parseWebhook(request);
  } catch (error) {
    // Could not even read/parse the request — not a settle failure, and not retryable. Ack.
    logger.warn({ event: "webhook_parse_error", provider, err: String(error) }, "payment webhook could not be parsed");
    return ack();
  }
  if (!parsed.ok) {
    // Forged / unsigned / unknown session: authentication failed. Ack (200) — never retry an attacker.
    logger.warn({ event: "webhook_rejected", provider, reason: parsed.reason }, "payment webhook rejected");
    return ack();
  }

  const orderId = typeof parsed.verify.raw?.orderId === "string" ? parsed.verify.raw.orderId : null;
  if (!orderId) {
    logger.warn({ event: "webhook_no_order", provider, providerPaymentId: parsed.verify.providerPaymentId }, "payment webhook carries no order binding");
    return ack();
  }

  // Authenticated webhook. A throw here is a transient failure on a GENUINE payment, so return 500 and
  // let the provider retry — acking 200 would fail open and silently drop a real settle.
  try {
    const outcome = await settleOrder(orderId);
    if (settleChangedStock(outcome)) revalidateTag("catalog", { expire: 0 });
  } catch (error) {
    logger.error({ event: "webhook_settle_error", provider, orderId, err: String(error) }, "payment webhook settle failed");
    return new Response(null, { status: 500 });
  }
  return ack();
}
