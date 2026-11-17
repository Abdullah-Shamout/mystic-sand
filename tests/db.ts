import { Pool } from "pg";

// Direct Postgres helpers for specs that must touch global server state the UI can't easily set up
// (the images and home_overrides tables). Each call opens and closes its own pool so no handle
// lingers to block a Playwright worker's exit. DATABASE_URL is the same DB `next start` serves (set
// by the runner).

async function dbQuery(sql: string, params?: unknown[]): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set for the DB test helpers.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(sql, params);
  } finally {
    await pool.end();
  }
}

async function dbQueryRows<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set for the DB test helpers.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(sql, params);
    return rows as T[];
  } finally {
    await pool.end();
  }
}

/** Deletes every uploaded-image row (the library lists from this table; images are not cached). */
export async function clearImages(): Promise<void> {
  await dbQuery("DELETE FROM images");
}

/**
 * Deletes every custom (c-…) product (its variants cascade) left behind by a crashed catalog spec.
 * db:seed only UPSERTs base rows, so a leftover custom product would survive and break "N products"
 * assertions. Safe to call at globalSetup (cold cache) before the first page load of the run.
 */
export async function clearCustomProducts(): Promise<void> {
  await dbQuery("DELETE FROM products WHERE slug LIKE 'c-%'");
}

/** Deletes every admin row (sessions cascade). The seed is create-only (production-safe: a re-seed
 * never overwrites a rotated password), so globalSetup clears admins first and lets the seed re-create
 * the known test admin — deterministic even on a reused DB whose admin password diverged. */
export async function clearAdmins(): Promise<void> {
  await dbQuery("DELETE FROM admin_users");
}

/** The authoritative variants.stock for a sku (what the admin set-stock action writes), or -1 if none. */
export async function readVariantStock(sku: string): Promise<number> {
  const rows = await dbQueryRows<{ stock: number }>("SELECT stock FROM variants WHERE sku = $1", [sku]);
  return rows[0]?.stock ?? -1;
}

/** Sets variants.stock directly (bypasses the admin action — the storefront catalog cache may lag). */
export async function setVariantStock(sku: string, value: number): Promise<void> {
  await dbQuery("UPDATE variants SET stock = $1 WHERE sku = $2", [value, sku]);
}

export type OrderRow = { id: string; status: string; oversold: boolean; total_fils: number };

/** One order row (status + oversold flag + total), or null. */
export async function readOrder(id: string): Promise<OrderRow | null> {
  const rows = await dbQueryRows<OrderRow>(
    "SELECT id, status, oversold, total_fils FROM orders WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

/** An order's internal secrets (never exposed by the guest lookup projection) — for no-leak assertions. */
export async function readOrderSecrets(
  id: string,
): Promise<{ checkoutToken: string; providerPaymentId: string | null }> {
  const rows = await dbQueryRows<{ checkout_token: string; provider_payment_id: string | null }>(
    "SELECT checkout_token, provider_payment_id FROM orders WHERE id = $1",
    [id],
  );
  return {
    checkoutToken: rows[0]?.checkout_token ?? "",
    providerPaymentId: rows[0]?.provider_payment_id ?? null,
  };
}

/** The most recently created order row, or null — used after a purchase flow whose id is server-minted. */
export async function readLatestOrder(): Promise<OrderRow | null> {
  const rows = await dbQueryRows<OrderRow>(
    "SELECT id, status, oversold, total_fils FROM orders ORDER BY created_at DESC LIMIT 1",
    [],
  );
  return rows[0] ?? null;
}

/** Backdates an order's created_at by N minutes, so the stale-pending reconcile selects it. */
export async function backdateOrder(id: string, minutes: number): Promise<void> {
  await dbQuery("UPDATE orders SET created_at = now() - ($1 * interval '1 minute') WHERE id = $2", [minutes, id]);
}

/**
 * Rewinds a settled order to the "pending, nothing-settled" state: clears its payment attempts and
 * inventory moves and resets the status flags. Used to model a provider capture that our own settle
 * never persisted (the scenario the reconciler recovers) — the live provider session is unaffected.
 */
export async function resetOrderToPendingUnsettled(id: string): Promise<void> {
  await dbQuery("DELETE FROM payment_attempts WHERE order_id = $1", [id]);
  await dbQuery("DELETE FROM inventory_moves WHERE order_id = $1", [id]);
  await dbQuery(
    "UPDATE orders SET status = 'pending', oversold = false, paid_at = NULL, finalized_at = NULL WHERE id = $1",
    [id],
  );
}

/**
 * Inserts a payment_attempts row for a (pending) order — DURABLE evidence of a possibly-captured
 * payment. The reconciler must SKIP (never auto-cancel) a still-pending order that has such a row.
 */
export async function insertMismatchAttempt(orderId: string): Promise<void> {
  await dbQuery(
    `INSERT INTO payment_attempts (order_id, provider, provider_payment_id, result, amount_fils, verified_at)
     VALUES ($1, 'sandbox', $2, 'CAPTURED', 1, now())`,
    [orderId, `sbx_mismatch_${orderId.replace(/\W/g, "")}`],
  );
}

/** How many inventory_moves rows an order produced (one per fulfilled line on a captured order). */
export async function countSaleMoves(orderId: string): Promise<number> {
  const rows = await dbQueryRows<{ n: string }>(
    "SELECT count(*)::text AS n FROM inventory_moves WHERE order_id = $1 AND reason = 'sale'",
    [orderId],
  );
  return Number(rows[0]?.n ?? "0");
}

/**
 * Wipes every site order (and its lines / attempts / moves). payment_attempts has no ON DELETE to
 * orders, so it is deleted FIRST; order_lines cascade from orders, inventory_moves are removed
 * outright. Called at globalSetup and by the purchase specs' afterEach so the admin "N samples"
 * counts (which expect zero DB site orders) stay deterministic. Does NOT restore variants.stock —
 * specs assert stock as before/after deltas.
 */
export async function clearOrders(): Promise<void> {
  await dbQuery("DELETE FROM payment_attempts");
  await dbQuery("DELETE FROM inventory_moves");
  await dbQuery("DELETE FROM orders");
}

// --- Contact messages (the submitContact server action) ------------------------------

/** Wipes every contact_messages row. Called at globalSetup so the contact specs start from empty. */
export async function clearContactMessages(): Promise<void> {
  await dbQuery("DELETE FROM contact_messages");
}

export type ContactRow = { name: string; phone: string; message: string; locale: string; ip: string | null };

/** The most recently created contact_messages row, or null — the submitted details are server-stored. */
export async function readLatestContactMessage(): Promise<ContactRow | null> {
  const rows = await dbQueryRows<ContactRow>(
    "SELECT name, phone, message, locale, ip FROM contact_messages ORDER BY created_at DESC LIMIT 1",
    [],
  );
  return rows[0] ?? null;
}

/** How many contact_messages rows were stored for one client IP (the rate-limit spec keys on its IP). */
export async function countContactMessagesForIp(ip: string): Promise<number> {
  const rows = await dbQueryRows<{ n: string }>(
    "SELECT count(*)::text AS n FROM contact_messages WHERE ip = $1",
    [ip],
  );
  return Number(rows[0]?.n ?? "0");
}

const SAMPLE_DETAILS = {
  name: "Website Tester",
  phone: "99887766",
  email: "",
  areaId: "salmiya",
  housing: "house",
  block: "1",
  street: "Street 1",
  avenue: "",
  building: "5",
  floor: "",
  apartment: "",
  mapsLink: "",
  notes: "",
  deliveryMethod: "standard",
  paymentMethod: "knet",
  saveDetails: true,
};

/** One order line for insertPaidOrder (size defaults to 50 ml). */
export type PaidOrderLine = {
  sku: string;
  slug: string;
  name: string;
  qty: number;
  priceFils: number;
  sizeEn?: string;
  sizeAr?: string;
};

/**
 * Inserts a fully-paid site order (order + its lines + a CAPTURED attempt with a full receipt record)
 * directly, for the admin dashboard / analysis specs that need real Website orders without driving the
 * whole purchase flow. Totals are derived from the lines (+ a 1.000 KWD delivery fee); `daysAgo`
 * backdates the order so the period filters can be exercised. The attempt carries track/tran/ref/auth
 * (and a bank id for KNET) so the receipt PDF renders a full invoice.
 */
export async function insertPaidOrder(opts: {
  id: string;
  name?: string;
  phone?: string;
  method?: "knet" | "applepay" | "card";
  locale?: "en" | "ar";
  bankId?: string;
  daysAgo?: number;
  lines?: PaidOrderLine[];
  /** Legacy single-line convenience (ignored when `lines` is given). */
  sku?: string;
  slug?: string;
  lineName?: string;
}): Promise<void> {
  const method = opts.method ?? "knet";
  const locale = opts.locale ?? "en";
  const customer = opts.name ?? "Website Tester";
  const phone = opts.phone ?? "99887766";
  const lines: PaidOrderLine[] =
    opts.lines ??
    [{ sku: opts.sku ?? "MS-I-50", slug: opts.slug ?? "i", name: opts.lineName ?? "I", qty: 1, priceFils: 19000 }];

  const subtotal = lines.reduce((n, l) => n + l.priceFils * l.qty, 0);
  const delivery = 1000;
  const total = subtotal + delivery;
  const details = { ...SAMPLE_DETAILS, name: customer, phone, paymentMethod: method };
  const bagKey = `${lines.map((l) => `${l.sku}x${l.qty}`).join("+")}|standard|`;
  const bankId = opts.bankId ?? (method === "knet" ? "nbk" : null);
  const paymentId = `sbx_${opts.id.replace(/\W/g, "")}`;
  const daysAgo = opts.daysAgo ?? 0;

  await dbQuery(
    `INSERT INTO orders
       (id, status, oversold, locale, method, subtotal_fils, discount_fils, delivery_fils, total_fils,
        promo_code, bag_key, details, phone_e164, checkout_token, provider, provider_payment_id,
        created_at, paid_at, finalized_at)
     VALUES ($1,'paid',false,$2,$3,$4,0,$5,$6,NULL,$7,$8::jsonb,$9,$10,'sandbox',$11,
             now() - ($12 * interval '1 day'), now() - ($12 * interval '1 day'), now() - ($12 * interval '1 day'))`,
    [opts.id, locale, method, subtotal, delivery, total, bagKey, JSON.stringify(details), `+965${phone}`, `tok_${opts.id}`, paymentId, daysAgo],
  );
  for (const l of lines) {
    await dbQuery(
      `INSERT INTO order_lines (order_id, sku, slug, qty, price_fils, name, size, image)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'products/i/bottle')`,
      [opts.id, l.sku, l.slug, l.qty, l.priceFils, l.name, JSON.stringify({ en: l.sizeEn ?? "50 ml", ar: l.sizeAr ?? "50 مل" })],
    );
  }
  await dbQuery(
    `INSERT INTO payment_attempts
       (order_id, provider, provider_payment_id, result, amount_fils, track_id, tran_id, ref, auth, bank_id, verified_at)
     VALUES ($1,'sandbox',$2,'CAPTURED',$3,$4,'481032957610423','582104739162','604218',$5, now())`,
    [opts.id, paymentId, total, opts.id, bankId],
  );
}

/**
 * Inserts a bare image row so the library lists `u:<id>` without an actual upload. No file is
 * written, so the served thumbnail 404s — fine for tests that only check the row is listed/deleted.
 */
export async function seedImageRow(id: string, kind: "packshot" | "photo" = "photo"): Promise<void> {
  await dbQuery(
    `INSERT INTO images (id, kind, width, height, mime, bytes, storage_path)
     VALUES ($1, $2, 8, 8, 'image/webp', 0, $3)
     ON CONFLICT (id) DO NOTHING`,
    [id, kind, `${id}.webp`],
  );
}

// --- home_overrides singleton (the home-page CMS blob) -------------------------------

/** Deletes the home_overrides row so the storefront falls back to the built-in home defaults. */
export async function clearHome(): Promise<void> {
  await dbQuery("DELETE FROM home_overrides");
}

/**
 * Upserts the home_overrides singleton (id = 1) with a raw jsonb blob. The storefront read runs it
 * through cleanHome(), so garbage falls back to defaults. Note: the server caches the home read for
 * HOME_REVALIDATE seconds, so this is only reliable BEFORE the first page load of the run (a cold
 * cache miss reads the seeded row). Mid-run setup should go through the editor (updateTag purges).
 */
export async function seedHomeRow(data: unknown): Promise<void> {
  await dbQuery(
    `INSERT INTO home_overrides (id, data) VALUES (1, $1::jsonb)
     ON CONFLICT (id) DO UPDATE SET data = $1::jsonb, updated_at = now()`,
    [JSON.stringify(data)],
  );
}

/** The current home_overrides blob (already cleaned by the save action), or {} when there is no row. */
export async function readHomeRow(): Promise<Record<string, unknown>> {
  const rows = await dbQueryRows<{ data: Record<string, unknown> }>("SELECT data FROM home_overrides WHERE id = 1");
  return rows[0]?.data ?? {};
}
