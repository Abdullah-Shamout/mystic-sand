import "dotenv/config";

import { hash } from "@node-rs/argon2";
import { count } from "drizzle-orm";

import { categories as categoryData } from "@/data/categories";
import { products as productData } from "@/data/products";
import { promoCodes as promoData } from "@/data/site";
import { passwordIsStrong } from "@/lib/password-policy";
import { defaultSettings } from "@/lib/settings";
import { ARGON2_OPTIONS } from "@/server/auth/argon2-params";
import { getDb, getPool } from "@/server/db";
import * as t from "@/server/db/schema";

// Idempotent seed: upserts today's canonical catalog from src/data into the DB. Re-running
// converges to the same state (so it also RESETS stock/prices/copy to the src/data values —
// safe now because there is no admin yet; the lead should note this before it runs against a
// DB that holds admin edits). The row set reproduces buildCatalog(EMPTY): every product is one
// row, every variant one row, with the seed stock. `sort` is the array index (catalog order).

async function main() {
  const db = getDb();

  // The first admin, from ADMIN_USERNAME / ADMIN_PASSWORD. Validate BEFORE opening the transaction so a
  // weak/misconfigured password fails fast WITHOUT rolling back an otherwise-good catalog seed. Skipped
  // (with a warning) when either is unset, so we never create a blank/guessable admin.
  const adminUsername = process.env.ADMIN_USERNAME?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminUsername && adminPassword) {
    // Enforce the SAME strength policy the app applies to a password change, so the longest-lived
    // credential isn't the weakest. This rejects blank/whitespace and placeholders like "change-me".
    if (!passwordIsStrong(adminPassword)) {
      throw new Error(
        "ADMIN_PASSWORD is too weak: it needs >= 10 characters with an uppercase letter, a number and " +
          "a symbol (the committed placeholder is rejected on purpose). Set a strong ADMIN_PASSWORD and re-run.",
      );
    }
  } else {
    console.warn("Admin NOT seeded: set ADMIN_USERNAME and ADMIN_PASSWORD to create the first admin.");
  }

  await db.transaction(async (tx) => {
    // Categories (menu / footer / shop-chip order).
    for (let i = 0; i < categoryData.length; i++) {
      const c = categoryData[i];
      const row = { slug: c.slug, name: c.name, description: c.description, banner: c.banner, sort: i };
      await tx.insert(t.categories).values(row).onConflictDoUpdate({ target: t.categories.slug, set: row });
    }

    // Products + their variants.
    for (let i = 0; i < productData.length; i++) {
      const p = productData[i];
      const row = {
        slug: p.slug,
        name: p.name,
        category: p.category,
        alsoIn: p.alsoIn ?? [],
        collection: p.collection ?? null,
        type: p.type,
        family: p.family ?? null,
        tagline: p.tagline,
        description: p.description,
        howTo: p.howTo,
        notes: p.notes ?? null,
        images: p.images,
        badge: p.badge ?? null,
        related: p.related,
        aliases: p.aliases,
        hidden: p.hidden ?? false,
        todo: p.todo,
        sort: i,
      };
      const [inserted] = await tx
        .insert(t.products)
        .values(row)
        .onConflictDoUpdate({ target: t.products.slug, set: { ...row, updatedAt: new Date() } })
        .returning({ id: t.products.id });
      const productId = inserted.id;

      for (let j = 0; j < p.variants.length; j++) {
        const v = p.variants[j];
        const vrow = { productId, sku: v.sku, size: v.size, priceFils: v.priceFils, stock: v.stock, sort: j };
        await tx.insert(t.variants).values(vrow).onConflictDoUpdate({ target: t.variants.sku, set: vrow });
      }
    }

    // Store settings singleton (id = 1), from defaultSettings.
    const settingsRow = {
      id: 1,
      standardFeeFils: defaultSettings.standardFeeFils,
      whatsapp: defaultSettings.whatsapp,
      phone: defaultSettings.phone,
      ticker: defaultSettings.ticker,
    };
    await tx.insert(t.settings).values(settingsRow).onConflictDoUpdate({ target: t.settings.id, set: settingsRow });

    // Promo codes.
    for (const [code, info] of Object.entries(promoData)) {
      const prow = {
        code,
        percent: info.percent,
        // Live semantics (src/store/bag.ts): valid through end-of-day Kuwait time (+03:00).
        expiresAt: new Date(`${info.expires}T23:59:59+03:00`),
        active: true,
      };
      await tx.insert(t.promoCodes).values(prow).onConflictDoUpdate({ target: t.promoCodes.code, set: prow });
    }

    // Admin account (argon2id). Validated above the transaction. CREATE-ONLY: never overwrite an
    // existing admin's hash — a re-seed on deploy must not silently revert a password the admin
    // rotated in-app (which would also leave old sessions live); an intentional reset is a separate,
    // explicit step that also revokes sessions. Uses @node-rs/argon2 directly (ARGON2_OPTIONS matches
    // the app hasher + login timing pad) because the app's password module is "server-only".
    if (adminUsername && adminPassword) {
      const passwordHash = await hash(adminPassword, ARGON2_OPTIONS);
      await tx
        .insert(t.adminUsers)
        .values({ username: adminUsername, passwordHash, role: "admin" })
        .onConflictDoNothing({ target: t.adminUsers.username });
    }
  });

  const counts = {
    categories: (await db.select({ n: count() }).from(t.categories))[0].n,
    products: (await db.select({ n: count() }).from(t.products))[0].n,
    variants: (await db.select({ n: count() }).from(t.variants))[0].n,
    settings: (await db.select({ n: count() }).from(t.settings))[0].n,
    promoCodes: (await db.select({ n: count() }).from(t.promoCodes))[0].n,
  };
  console.log("Seed complete. Row counts:", JSON.stringify(counts));
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
