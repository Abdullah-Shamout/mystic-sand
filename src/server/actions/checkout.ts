"use server";

import { eq, inArray, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { z } from "zod";

import { maxQtyPerLine } from "@/data/site";
import { indexCatalog } from "@/lib/catalog";
import { normalizeKuwaitPhone } from "@/lib/phone";
import { bagKey, computeTotals, priceLines, type Promo } from "@/lib/pricing";
import { checkoutSchema, type CheckoutForm } from "@/lib/validation";
import { getDb, schema } from "@/server/db";
import { logger } from "@/server/log";
import { checkoutCookieName } from "@/server/orders/cookie";
import { getGateway } from "@/server/payments/registry";
import { getCatalogData } from "@/server/read/catalog";
import { getSettingsData } from "@/server/read/settings";

// The checkout entry point and the ONE place money is decided. It is a public POST endpoint (every
// "use server" export is), so it NEVER trusts the client for prices, discounts or stock: it reprices
// the bag entirely from the DB, re-resolves the promo percent from the promo_codes table, re-checks
// stock against variants.stock, and stores THOSE totals on the pending order. Any client-sent total
// or percent is ignored.
//
// It mirrors the auth actions' contract: it returns a typed result and NEVER throws a user-visible
// message (a production build redacts thrown action messages to a generic string the client can't
// read, so a throw would surface as noise).

const CHECKOUT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type InitiateCheckoutInput = {
  lines: { sku: string; qty: number }[];
  promoCode: string | null;
  details: Omit<CheckoutForm, "acceptTerms">;
  locale: "en" | "ar";
};

export type InitiateCheckoutError = "empty" | "unavailable" | "stock" | "promo" | "invalid" | "generic";

export type InitiateCheckoutResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; error: InitiateCheckoutError };

const lineSchema = z.object({
  sku: z.string().trim().min(1).max(64),
  qty: z.number().int().min(1).max(maxQtyPerLine),
});

const inputSchema = z.object({
  lines: z.array(lineSchema).min(1).max(50),
  promoCode: z.string().trim().max(40).nullish(),
  details: z.unknown(),
  locale: z.enum(["en", "ar"]),
});

/** 32 hex chars of CSPRNG — the per-order ownership token. */
function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function fail(error: InitiateCheckoutError): InitiateCheckoutResult {
  return { ok: false, error };
}

export async function initiateCheckout(input: InitiateCheckoutInput): Promise<InitiateCheckoutResult> {
  try {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) return fail("invalid");
    const { lines, locale } = parsed.data;
    const promoCode = parsed.data.promoCode ?? null;

    // Distinct SKUs only (a bag never holds the same sku twice).
    const skus = lines.map((l) => l.sku);
    if (new Set(skus).size !== skus.length) return fail("invalid");

    // Validate the delivery details with the SAME schema the form uses (terms are ticked client-side).
    const detailsParsed = checkoutSchema.safeParse({ ...(input.details as object), acceptTerms: true });
    if (!detailsParsed.success) return fail("invalid");
    const form = detailsParsed.data;
    const method = form.paymentMethod;
    const deliveryMethod = form.deliveryMethod;

    const db = getDb();

    // Reprice from the DB: catalog (price + visibility) is cache-fine; stock is read LIVE below.
    const catalogData = await getCatalogData();
    const settings = await getSettingsData();
    const catalog = indexCatalog(catalogData.products, catalogData.categories);

    const { priced, missing } = priceLines(lines, catalog);
    if (priced.length === 0) return fail("empty");
    if (missing.length > 0) return fail("unavailable"); // a hidden/unknown sku — computeTotals would drop it

    // Live stock check (NOT the 300s-cached catalog): reject if any line exceeds what is on hand now.
    const stockRows = await db
      .select({ sku: schema.variants.sku, stock: schema.variants.stock })
      .from(schema.variants)
      .where(inArray(schema.variants.sku, skus));
    const stockBySku = new Map(stockRows.map((r) => [r.sku, r.stock]));
    for (const line of priced) {
      const onHand = stockBySku.get(line.sku);
      if (onHand === undefined) return fail("unavailable");
      if (line.qty > onHand) return fail("stock");
    }

    // Re-resolve the promo percent from the promo_codes table — never trust a client-sent percent.
    let promo: Promo | null = null;
    if (promoCode) {
      const code = promoCode.toUpperCase();
      const [row] = await db
        .select()
        .from(schema.promoCodes)
        .where(eq(schema.promoCodes.code, code))
        .limit(1);
      if (!row || !row.active || (row.expiresAt && row.expiresAt.getTime() < Date.now())) return fail("promo");
      promo = { code: row.code, percent: row.percent };
    }

    const totals = computeTotals({ lines, deliveryMethod, promo, catalog, settings });

    // Freeze the details exactly as the client store would: normalized phone, unit fields cleared for a
    // house. (Re-implemented here rather than importing the client helper, which pulls "use client".)
    const house = form.housing === "house";
    const storedDetails: Omit<CheckoutForm, "acceptTerms"> = {
      name: form.name,
      phone: normalizeKuwaitPhone(form.phone),
      email: form.email,
      areaId: form.areaId,
      housing: form.housing,
      block: form.block,
      street: form.street,
      avenue: form.avenue,
      building: form.building,
      floor: house ? "" : form.floor,
      apartment: house ? "" : form.apartment,
      mapsLink: form.mapsLink,
      notes: form.notes,
      deliveryMethod,
      paymentMethod: method,
      saveDetails: form.saveDetails,
    };
    const phoneE164 = `+965${normalizeKuwaitPhone(form.phone)}`;

    // Order id from the Postgres sequence (MS-20000.., wide MAXVALUE, NO CYCLE). Never Math.random.
    const seq = await db.execute<{ n: string }>(sql`SELECT nextval('ms_order_seq') AS n`);
    const seqValue = seq.rows[0]?.n;
    if (!seqValue) return fail("generic");
    const orderId = `MS-${seqValue}`;
    const token = randomToken();

    // Derive the absolute origin + return URL from the request headers (keeps next/headers out of the
    // payment adapter). trailingSlash:true → keep the slash before the query.
    const h = await headers();
    const host = h.get("host");
    if (!host) return fail("generic");
    const proto = h.get("x-forwarded-proto") ?? (process.env.APP_ENV === "production" ? "https" : "http");
    const origin = `${proto}://${host}`;
    const returnUrl = `${origin}/${locale}/checkout/result/?order=${encodeURIComponent(orderId)}`;

    // Create the payment with the provider BEFORE inserting the order, so the order row carries the
    // providerPaymentId from the start (settleOrder reads it back under the row lock).
    const gateway = getGateway();
    const { redirectUrl, providerPaymentId } = await gateway.initiate({
      orderId,
      amountFils: totals.totalFils,
      currency: "KWD",
      method,
      locale,
      returnUrl,
      origin,
    });

    const key = bagKey({ lines, deliveryMethod, promo });
    await db.transaction(async (tx) => {
      await tx.insert(schema.orders).values({
        id: orderId,
        status: "pending",
        locale,
        method,
        subtotalFils: totals.subtotalFils,
        discountFils: totals.discountFils,
        deliveryFils: totals.deliveryFils,
        totalFils: totals.totalFils,
        promoCode: promo?.code ?? null,
        bagKey: key,
        details: storedDetails,
        phoneE164,
        checkoutToken: token,
        provider: gateway.provider,
        providerPaymentId,
      });
      await tx.insert(schema.orderLines).values(
        priced.map((l) => ({
          orderId,
          sku: l.sku,
          slug: l.product.slug,
          qty: l.qty,
          priceFils: l.variant.priceFils,
          name: l.product.name,
          size: l.variant.size,
          image: l.product.images.card,
        })),
      );
    });

    const cookieStore = await cookies();
    cookieStore.set(checkoutCookieName(orderId), token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.APP_ENV === "production" || proto === "https",
      path: "/",
      maxAge: CHECKOUT_COOKIE_MAX_AGE,
    });

    return { ok: true, redirectUrl };
  } catch (error) {
    logger.error({ event: "initiate_checkout_failed", err: String(error) }, "initiateCheckout failed");
    return fail("generic");
  }
}
