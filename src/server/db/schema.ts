import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { Category } from "@/data/categories";
import type { PaymentMethod } from "@/data/site";
import type { CategorySlug, Localized, Notes, Product } from "@/data/types";
import type { HomeOverrides } from "@/lib/home";
import type { StoreSettings } from "@/lib/settings";
import type { CheckoutForm } from "@/lib/validation";

// Drizzle schema for the Mystic Sand backend (Phase 1 — data layer only).
//
// Conventions:
//  - Money is integer `fils` with CHECK (>= 0); never floats.
//  - Localized / object fields are `jsonb`, `$type<...>()`-d to the exact TS shapes in
//    src/data + src/lib so the pure validators keep working later.
//  - Scalar strings stay `text` (NOT jsonb). Drizzle's jsonb reader double-parses string
//    scalars (node-postgres already parses jsonb, then drizzle JSON.parses again), which
//    would corrupt a numeric-looking product name like "212"/"4711" into a number. See
//    `products.name` and `order_lines.name`.
//  - Timestamps are `timestamptz` with `{ mode: "date" }` so reads/writes use JS `Date`.

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** Order lifecycle (server-side; note this excludes the client-only "confirming"). */
export type OrderStatus = "pending" | "paid" | "failed" | "canceled";
/** Settlement result recorded on a payment attempt (task's set; excludes "PENDING"). */
export type PaymentResult = "CAPTURED" | "NOT CAPTURED" | "CANCELED";
/** Reason for an inventory ledger move. */
export type InventoryReason = "sale" | "admin_set" | "restock" | "adjust";
/** UI locale stored on orders / contact messages. */
export type DbLocale = "en" | "ar";

// --- Catalog -------------------------------------------------------------------------

export const categories = pgTable("categories", {
  slug: text("slug").primaryKey().$type<CategorySlug>(),
  name: jsonb("name").notNull().$type<Localized>(),
  description: jsonb("description").notNull().$type<Localized>(),
  banner: jsonb("banner").notNull().$type<Category["banner"]>(),
  sort: integer("sort").notNull(),
});

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    // Plain string (packaging name), stored as text — see the double-parse note above.
    name: text("name").notNull(),
    category: text("category")
      .notNull()
      .$type<CategorySlug>()
      .references(() => categories.slug),
    alsoIn: text("also_in")
      .array()
      .notNull()
      .$type<CategorySlug[]>()
      .default(sql`'{}'::text[]`),
    collection: text("collection").$type<"trilogy">(),
    type: jsonb("type").notNull().$type<Localized>(),
    family: jsonb("family").$type<Localized>(),
    tagline: jsonb("tagline").notNull().$type<Localized>(),
    description: jsonb("description").notNull().$type<Localized>(),
    howTo: jsonb("how_to").notNull().$type<Localized>(),
    notes: jsonb("notes").$type<Notes>(),
    // Media key references; `u:<id>` resolution is a later phase.
    images: jsonb("images").notNull().$type<Product["images"]>(),
    badge: text("badge").$type<"new">(),
    related: text("related").array().notNull().default(sql`'{}'::text[]`),
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
    hidden: boolean("hidden").notNull().default(false),
    todo: text("todo")
      .array()
      .notNull()
      .$type<Product["todo"]>()
      .default(sql`'{}'::text[]`),
    sort: integer("sort").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("products_category_idx").on(t.category)],
);

export const variants = pgTable(
  "variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: text("sku").notNull().unique(),
    size: jsonb("size").notNull().$type<Localized>(),
    priceFils: integer("price_fils").notNull(),
    stock: integer("stock").notNull().default(0),
    sort: integer("sort").notNull(),
  },
  (t) => [
    check("variants_price_fils_nonneg", sql`${t.priceFils} >= 0`),
    check("variants_stock_nonneg", sql`${t.stock} >= 0`),
    index("variants_product_idx").on(t.productId),
  ],
);

// --- Orders & inventory --------------------------------------------------------------

/**
 * Order-number source. An order id is `'MS-' || nextval('ms_order_seq')`, starting the real-order band
 * at MS-20000 (sample orders reserve 10000..19999). The band is WIDE on purpose: every initiateCheckout
 * — including abandoned / failed attempts — burns a nextval, so a 5-digit ceiling (99999) could be
 * exhausted by ~80k public checkouts and, with `NO CYCLE`, permanently break checkout (nextval would
 * throw) — a store-wide DoS. The 10-digit MAXVALUE puts exhaustion out of practical reach (a per-IP
 * checkout rate-limit is a separate, deferred hardening). `NO CYCLE` still guarantees ids are never
 * recycled. The number comes from Postgres, so two concurrent checkouts can never collide.
 */
export const orderSeq = pgSequence("ms_order_seq", {
  startWith: 20000,
  minValue: 20000,
  maxValue: 9999999999,
  increment: 1,
  cycle: false,
});

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(), // MS-#####
    status: text("status").notNull().$type<OrderStatus>().default("pending"),
    oversold: boolean("oversold").notNull().default(false),
    locale: text("locale").notNull().$type<DbLocale>(),
    method: text("method").notNull().$type<PaymentMethod>(),
    subtotalFils: integer("subtotal_fils").notNull(),
    discountFils: integer("discount_fils").notNull(),
    deliveryFils: integer("delivery_fils").notNull(),
    totalFils: integer("total_fils").notNull(),
    promoCode: text("promo_code"),
    bagKey: text("bag_key").notNull(),
    // CheckoutForm minus the acceptTerms checkbox.
    details: jsonb("details").notNull().$type<Omit<CheckoutForm, "acceptTerms">>(),
    phoneE164: text("phone_e164").notNull(),
    checkoutToken: text("checkout_token").notNull(),
    // The active provider + its payment id for this order, written at initiate so settleOrder(orderId)
    // can call getGateway().verify without trusting the (client-visible) return-URL query. Nullable:
    // the order row exists only after the gateway call succeeds, but the columns stay loose so a future
    // retry that re-initiates with a new provider payment id is a plain UPDATE.
    provider: text("provider"),
    providerPaymentId: text("provider_payment_id"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    paidAt: timestamptz("paid_at"),
    finalizedAt: timestamptz("finalized_at"),
    fulfilledAt: timestamptz("fulfilled_at"),
  },
  (t) => [
    check("orders_subtotal_fils_nonneg", sql`${t.subtotalFils} >= 0`),
    check("orders_discount_fils_nonneg", sql`${t.discountFils} >= 0`),
    check("orders_delivery_fils_nonneg", sql`${t.deliveryFils} >= 0`),
    check("orders_total_fils_nonneg", sql`${t.totalFils} >= 0`),
    index("orders_phone_idx").on(t.phoneE164),
    index("orders_checkout_token_idx").on(t.checkoutToken),
    index("orders_status_idx").on(t.status),
    index("orders_created_at_idx").on(t.createdAt),
  ],
);

export const orderLines = pgTable(
  "order_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    slug: text("slug").notNull(),
    qty: integer("qty").notNull(),
    priceFils: integer("price_fils").notNull(),
    // Frozen product name snapshot (plain string) — text, see the double-parse note.
    name: text("name").notNull(),
    size: jsonb("size").notNull().$type<Localized>(),
    image: text("image"),
  },
  (t) => [
    check("order_lines_price_fils_nonneg", sql`${t.priceFils} >= 0`),
    index("order_lines_order_idx").on(t.orderId),
  ],
);

export const inventoryMoves = pgTable(
  "inventory_moves",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // ON DELETE SET NULL + nullable: the catalog admin (deleteProduct / resetProduct / resetAllCatalog
    // via writeVariants) deletes or replaces variant rows, and a sale leaves an inventory_moves row
    // pointing at the variant. SET NULL lets those deletes proceed while PRESERVING the ledger row
    // (delta / reason / orderId) as an orphaned-but-intact audit record; RESTRICT would instead block
    // deleting any variant that has ever sold. The move's orderId still ties it to the sale.
    variantId: uuid("variant_id").references(() => variants.id, { onDelete: "set null" }),
    // Signed quantity delta (sale is negative, restock positive) — NOT money, no CHECK.
    delta: integer("delta").notNull(),
    reason: text("reason").notNull().$type<InventoryReason>(),
    orderId: text("order_id").references(() => orders.id, { onDelete: "set null" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("inventory_moves_variant_idx").on(t.variantId),
    index("inventory_moves_order_idx").on(t.orderId),
  ],
);

export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    provider: text("provider").notNull(),
    providerPaymentId: text("provider_payment_id").notNull(),
    trackId: text("track_id"),
    tranId: text("tran_id"),
    ref: text("ref"),
    auth: text("auth"),
    bankId: text("bank_id"),
    result: text("result").$type<PaymentResult>(),
    amountFils: integer("amount_fils").notNull(),
    raw: jsonb("raw").$type<Record<string, unknown>>(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    verifiedAt: timestamptz("verified_at"),
  },
  (t) => [
    check("payment_attempts_amount_fils_nonneg", sql`${t.amountFils} >= 0`),
    // Webhook/return idempotency: one row per provider payment id.
    uniqueIndex("payment_attempts_provider_payment_unique").on(t.provider, t.providerPaymentId),
    index("payment_attempts_order_idx").on(t.orderId),
  ],
);

// --- Singletons & CMS ----------------------------------------------------------------

export const settings = pgTable(
  "settings",
  {
    id: smallint("id").primaryKey(),
    standardFeeFils: integer("standard_fee_fils").notNull(),
    whatsapp: text("whatsapp").notNull(),
    phone: text("phone").notNull(),
    ticker: jsonb("ticker").notNull().$type<StoreSettings["ticker"]>(),
  },
  (t) => [
    check("settings_singleton", sql`${t.id} = 1`),
    check("settings_standard_fee_fils_nonneg", sql`${t.standardFeeFils} >= 0`),
  ],
);

export const homeOverrides = pgTable(
  "home_overrides",
  {
    id: smallint("id").primaryKey(),
    data: jsonb("data").notNull().$type<HomeOverrides>().default(sql`'{}'::jsonb`),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [check("home_overrides_singleton", sql`${t.id} = 1`)],
);

export const images = pgTable("images", {
  // The `<id>` inside a `u:<id>` media key.
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  mime: text("mime").notNull(),
  bytes: integer("bytes").notNull(),
  storagePath: text("storage_path").notNull(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

// --- Auth ----------------------------------------------------------------------------

export const adminUsers = pgTable(
  "admin_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(), // stored lowercased
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("admin"),
    passwordChangedAt: timestamptz("password_changed_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("admin_users_username_unique").on(t.username)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    lastSeenAt: timestamptz("last_seen_at").notNull().defaultNow(),
    userAgent: text("user_agent"),
    revokedAt: timestamptz("revoked_at"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// --- Promotions & contact ------------------------------------------------------------

export const promoCodes = pgTable(
  "promo_codes",
  {
    code: text("code").primaryKey(),
    percent: integer("percent").notNull(),
    expiresAt: timestamptz("expires_at"),
    active: boolean("active").notNull().default(true),
  },
  // A percent outside 1..100 would drive a negative or nonsensical discount (and total). The DB
  // enforces the bound so a bad promo row can never produce an odd order total.
  (t) => [check("promo_codes_percent_range", sql`${t.percent} between 1 and 100`)],
);

export const contactMessages = pgTable("contact_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  message: text("message").notNull(),
  locale: text("locale").notNull().$type<DbLocale>(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  handled: boolean("handled").notNull().default(false),
  ip: text("ip"),
});
