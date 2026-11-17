import "dotenv/config";

import { hash } from "@node-rs/argon2";
import { and, eq, isNull } from "drizzle-orm";

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
  const now = new Date();

  // UPSERT: create the admin if it is missing, else rotate its hash. Uses @node-rs/argon2 directly
  // (ARGON2_OPTIONS matches the app hasher) because the app's password module is "server-only".
  const [admin] = await db
    .insert(t.adminUsers)
    .values({ username, passwordHash, role: "admin", passwordChangedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: t.adminUsers.username,
      set: { passwordHash, passwordChangedAt: now, updatedAt: now },
    })
    .returning({ id: t.adminUsers.id });

  // Belt-and-suspenders: revoke every LIVE session for this admin. verifySession rejects a row whose
  // revokedAt is set; it does NOT compare createdAt against passwordChangedAt, so the passwordChangedAt
  // bump above does not revoke on its own — this explicit revoke is the actual invalidation.
  const revoked = await db
    .update(t.sessions)
    .set({ revokedAt: now })
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
