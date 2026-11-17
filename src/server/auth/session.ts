import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { cache } from "react";

import { getDb, schema } from "@/server/db";
import type { Tx } from "@/server/db/locks";
import { signSessionToken, verifySessionToken } from "./jwt";

// Session DAL. A session is one `sessions` row (the source of truth) plus a jose-signed cookie that
// carries its id. The cookie lets the Proxy do an optimistic signature check on the Edge; the
// authoritative check — row exists, not revoked, not expired, and not predating the user's last
// password change — is verifySession() here, in the Node runtime (admin layout + Server Actions +
// the image route via requireAdmin).

const COOKIE_NAME = "ms_session";
const TWELVE_HOURS_S = 12 * 60 * 60;
const THIRTY_DAYS_S = 30 * 24 * 60 * 60;
const LAST_SEEN_THROTTLE_MS = 60 * 1000;

export type SessionUser = { userId: string; username: string; role: string };

/**
 * Secure cookie when the app is deployed to production (APP_ENV) or the request already arrived over
 * https. Deliberately NOT keyed on NODE_ENV: `next start` sets NODE_ENV=production even for the local
 * http test server, where a Secure cookie would never be stored and every login would silently fail.
 */
function isSecureRequest(forwardedProto: string | null): boolean {
  return process.env.APP_ENV === "production" || forwardedProto === "https";
}

/**
 * Inserts a session row and sets the signed cookie. `expiresAt` (and the cookie maxAge + the JWT
 * exp) is 30 days when "keep me signed in" is ticked, else 12 hours.
 *
 * The insert runs in a transaction that first takes a `FOR UPDATE` lock on the admin row. When
 * `requirePasswordHash` is supplied (the login path) the locked row's hash is re-checked against the
 * value the caller already verified: if a concurrent `changePassword` rotated it (its UPDATE on this
 * same row serialises with this lock), the login is aborted — returning `{ ok: false }`, no row
 * inserted — so a session authenticated against a now-stale password is never created (closes the
 * login TOCTOU). The cookie store + proto are read BEFORE the tx, so the only post-commit step is
 * the synchronous cookie write — nothing async can fail after the row is committed.
 */
export async function createSession(
  userId: string,
  {
    remember,
    userAgent,
    requirePasswordHash,
  }: { remember: boolean; userAgent?: string | null; requirePasswordHash?: string },
): Promise<{ ok: true } | { ok: false }> {
  const db = getDb();
  const ttlSeconds = remember ? THIRTY_DAYS_S : TWELVE_HOURS_S;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const ua = userAgent?.slice(0, 512) ?? null;

  const proto = (await headers()).get("x-forwarded-proto");
  const cookieStore = await cookies();

  const result = await db.transaction(
    async (tx): Promise<{ ok: true; token: string } | { ok: false }> => {
      const [user] = await tx
        .select({ role: schema.adminUsers.role, passwordHash: schema.adminUsers.passwordHash })
        .from(schema.adminUsers)
        .where(eq(schema.adminUsers.id, userId))
        .limit(1)
        .for("update");
      if (!user) throw new Error("createSession: unknown user");
      // TOCTOU guard (login): abort if the stored hash is no longer the one the caller verified
      // against — a concurrent changePassword rotated it after verifyPassword but before this insert.
      if (requirePasswordHash !== undefined && user.passwordHash !== requirePasswordHash) {
        return { ok: false };
      }
      const [row] = await tx
        .insert(schema.sessions)
        .values({ userId, expiresAt, userAgent: ua })
        .returning({ id: schema.sessions.id });
      // Sign inside the tx so a signing failure rolls the just-inserted session row back.
      const token = await signSessionToken({ sid: row.id, role: user.role }, expiresAt);
      return { ok: true, token };
    },
  );

  if (!result.ok) return { ok: false };
  const [name, value, options] = sessionCookieArgs(result.token, ttlSeconds, proto);
  cookieStore.set(name, value, options);
  return { ok: true };
}

/** Builds the `cookies().set(...)` arguments for a session token. Pure (no I/O) so the caller can set
 * the cookie synchronously immediately after its transaction commits. */
export function sessionCookieArgs(
  token: string,
  maxAgeSeconds: number,
  forwardedProto: string | null,
): [string, string, { httpOnly: true; sameSite: "lax"; secure: boolean; path: string; maxAge: number }] {
  return [
    COOKIE_NAME,
    token,
    { httpOnly: true, sameSite: "lax", secure: isSecureRequest(forwardedProto), path: "/", maxAge: maxAgeSeconds },
  ];
}

/**
 * Password-change session rotation, run INSIDE the caller's transaction (so the credential UPDATE, the
 * revoke sweep and this re-mint commit atomically). Revokes EVERY live session for the user —
 * INCLUDING the current one — then mints one fresh replacement that carries over the current session's
 * remaining lifetime. The replacement's `createdAt` defaults to the DB `now()` — the same
 * transaction-start timestamp the caller stamps on `passwordChangedAt` — so `createdAt ==
 * passwordChangedAt` and it is the single session that survives verifySession's strict
 * `created_at < password_changed_at` backstop, while every pre-change session (strictly earlier) is
 * rejected by it. Signs the new token inside the tx; the caller sets the cookie after the commit.
 */
export async function rotateSessionForPasswordChange(
  tx: Tx,
  {
    userId,
    role,
    currentSessionId,
    userAgent,
  }: { userId: string; role: string; currentSessionId: string | null; userAgent: string | null },
): Promise<{ token: string; maxAgeSeconds: number }> {
  // Carry over the current session's remaining lifetime (so a "keep me signed in" admin isn't silently
  // downgraded to 12h). Read BEFORE the revoke sweep; fall back to the short TTL defensively.
  let expiresAt: Date | undefined;
  if (currentSessionId) {
    const [cur] = await tx
      .select({ expiresAt: schema.sessions.expiresAt })
      .from(schema.sessions)
      .where(eq(schema.sessions.id, currentSessionId))
      .limit(1);
    expiresAt = cur?.expiresAt;
  }
  expiresAt ??= new Date(Date.now() + TWELVE_HOURS_S * 1000);

  // Revoke EVERY live session for the user (including the current one), stamped with the DB clock.
  await tx
    .update(schema.sessions)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(schema.sessions.userId, userId), isNull(schema.sessions.revokedAt)));

  const [fresh] = await tx
    .insert(schema.sessions)
    .values({ userId, expiresAt, userAgent: userAgent?.slice(0, 512) ?? null })
    .returning({ id: schema.sessions.id, expiresAt: schema.sessions.expiresAt });

  const token = await signSessionToken({ sid: fresh.id, role }, fresh.expiresAt);
  const maxAgeSeconds = Math.max(1, Math.floor((fresh.expiresAt.getTime() - Date.now()) / 1000));
  return { token, maxAgeSeconds };
}

/**
 * The authenticated admin for this request, or null. Memoised per request with React cache(), so
 * the locale layout, the admin layout and any Server Component that calls it share one DB read.
 * NEVER throws and NEVER writes the cookie (it runs during render, where cookie writes throw) — a
 * failed/expired/revoked session simply resolves to null and the caller redirects.
 */
export const verifySession = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null; // storefront visitors: no DB read at all
  const payload = await verifySessionToken(token);
  if (!payload) return null;

  try {
    const db = getDb();
    const [row] = await db
      .select({
        userId: schema.sessions.userId,
        expiresAt: schema.sessions.expiresAt,
        revokedAt: schema.sessions.revokedAt,
        lastSeenAt: schema.sessions.lastSeenAt,
        username: schema.adminUsers.username,
        role: schema.adminUsers.role,
        // Backstop: true when this session was created before the user last rotated their password.
        // Compared in SQL (microsecond timestamps, both DB-written) so there is no JS/DB clock skew
        // and no millisecond-truncation mismatch. NULL passwordChangedAt (never rotated) → false.
        passwordStale: sql<boolean>`coalesce(${schema.sessions.createdAt} < ${schema.adminUsers.passwordChangedAt}, false)`,
      })
      .from(schema.sessions)
      .innerJoin(schema.adminUsers, eq(schema.sessions.userId, schema.adminUsers.id))
      .where(eq(schema.sessions.id, payload.sid))
      .limit(1);

    if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now()) return null;
    // A session that predates the user's last password change is rejected even if its row was never
    // explicitly revoked — the activated passwordChangedAt backstop (closes the revoke-sweep gaps).
    if (row.passwordStale === true) return null;

    // Throttle the lastSeenAt write so a burst of reads doesn't write on every request.
    if (Date.now() - row.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
      try {
        await db
          .update(schema.sessions)
          .set({ lastSeenAt: new Date() })
          .where(eq(schema.sessions.id, payload.sid));
      } catch {
        // best-effort; a failed touch must not fail the request
      }
    }

    // Role comes from the DB row, never the (client-held) token.
    return { userId: row.userId, username: row.username, role: row.role };
  } catch {
    return null;
  }
});

/** The current session's id (from the cookie), or null. Used on a password change to carry the
 * current session's remaining lifetime over to its fresh re-minted replacement. */
export async function getCurrentSessionId(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  const payload = await verifySessionToken(token);
  return payload?.sid ?? null;
}

/** Revokes the current session row and clears the cookie (logout). */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = await verifySessionToken(token);
  if (payload) {
    try {
      await getDb()
        .update(schema.sessions)
        .set({ revokedAt: new Date() })
        .where(eq(schema.sessions.id, payload.sid));
    } catch {
      // clearing the cookie below still signs the user out of this browser
    }
  }
  cookieStore.delete(COOKIE_NAME);
}
