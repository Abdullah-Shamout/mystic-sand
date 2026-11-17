import "dotenv/config";

import { hash } from "@node-rs/argon2";
import { and, eq, isNull, sql } from "drizzle-orm";

import { passwordIsStrong } from "@/lib/password-policy";
import { ARGON2_OPTIONS } from "@/server/auth/argon2-params";
import { getDb, getPool } from "@/server/db";
import * as t from "@/server/db/schema";

// Explicit admin credential RESET / RECOVERY — the only recovery path now that seeding is create-only
// (a re-seed never overwrites an existing admin's hash). Unlike the seed, this FAILS LOUDLY on a
// missing or weak credential (an explicit reset with no usable password is an error, not a silent
// skip). It UPSERTs the admin, so it both RESETS a forgotten password and RECOVERS a missing admin,
// and it revokes that user's live sessions so a leaked/old session cannot survive the reset.
//
// Run:  ADMIN_USERNAME=admin ADMIN_PASSWORD='<strong>' npm run admin:reset

async function main() {
  const username = process.env.ADMIN_USERNAME?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    console.error("admin:reset FAILED: set ADMIN_USERNAME and ADMIN_PASSWORD, then re-run.");
    process.exitCode = 1;
    return;
  }
  if (!passwordIsStrong(password)) {
    console.error(
      "admin:reset FAILED: ADMIN_PASSWORD is too weak — it needs >= 10 characters with an uppercase " +
        "letter, a number and a symbol. Set a strong value and re-run.",
    );
    process.exitCode = 1;
    return;
  }

  const db = getDb();
  const passwordHash = await hash(password, ARGON2_OPTIONS);

  // UPSERT: create the admin if it is missing, else rotate its hash. Uses @node-rs/argon2 directly
  // (ARGON2_OPTIONS matches the app hasher) because the app's password module is "server-only".
  // Stamp passwordChangedAt from the DB clock (sql`now()`), NOT a JS `new Date()`, so it shares one
  // clock with sessions.created_at (also DB-written) and verifySession's backstop comparison is free
  // of JS/DB skew — a login right after this reset must not be rejected by a script-clock timestamp.
  const [admin] = await db
    .insert(t.adminUsers)
    .values({ username, passwordHash, role: "admin", passwordChangedAt: sql`now()`, updatedAt: sql`now()` })
    .onConflictDoUpdate({
      target: t.adminUsers.username,
      set: { passwordHash, passwordChangedAt: sql`now()`, updatedAt: sql`now()` },
    })
    .returning({ id: t.adminUsers.id });

  // Belt-and-suspenders: revoke every LIVE session for this admin. verifySession now rejects a session
  // on EITHER a set revokedAt OR a createdAt that predates passwordChangedAt (the activated backstop),
  // so a leaked pre-reset session is invalidated two ways; this explicit revoke keeps the row's state
  // unambiguous and clears any session that somehow post-dates the stamp.
  const revoked = await db
    .update(t.sessions)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(t.sessions.userId, admin.id), isNull(t.sessions.revokedAt)))
    .returning({ id: t.sessions.id });

  console.log(`Admin "${username}": password reset. Sessions revoked: ${revoked.length}.`);
}

main()
  .catch((err) => {
    console.error("admin:reset failed:", err);
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
