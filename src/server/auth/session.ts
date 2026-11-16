import "server-only";

import { and, eq, isNull, ne } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { cache } from "react";

import { getDb, schema } from "@/server/db";
import { signSessionToken, verifySessionToken } from "./jwt";

// Session DAL. A session is one `sessions` row (the source of truth) plus a jose-signed cookie that
// carries its id. The cookie lets the Proxy do an optimistic signature check on the Edge; the
// authoritative check — row exists, not revoked, not expired — is verifySession() here, in the Node
// runtime (admin layout + Server Actions + the image route via requireAdmin).

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
 */
export async function createSession(
  userId: string,
  { remember, userAgent }: { remember: boolean; userAgent?: string | null },
): Promise<void> {
  const db = getDb();
  const [user] = await db
    .select({ role: schema.adminUsers.role })
    .from(schema.adminUsers)
    .where(eq(schema.adminUsers.id, userId))
    .limit(1);
  if (!user) throw new Error("createSession: unknown user");

  const ttlSeconds = remember ? THIRTY_DAYS_S : TWELVE_HOURS_S;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  const [row] = await db
    .insert(schema.sessions)
    .values({ userId, expiresAt, userAgent: userAgent?.slice(0, 512) ?? null })
    .returning({ id: schema.sessions.id });

  const token = await signSessionToken({ sid: row.id, role: user.role }, expiresAt);
  const proto = (await headers()).get("x-forwarded-proto");
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(proto),
    path: "/",
    maxAge: ttlSeconds,
  });
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
      })
      .from(schema.sessions)
      .innerJoin(schema.adminUsers, eq(schema.sessions.userId, schema.adminUsers.id))
      .where(eq(schema.sessions.id, payload.sid))
      .limit(1);

    if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now()) return null;

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

/** The current session's id (from the cookie), or null. Used to keep the current session alive when
 * revoking the rest on a password change. */
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

/** Revokes every other (still-live) session for a user, keeping `keepSessionId`. Used on password
 * change so other devices are signed out while the current one stays in. */
export async function revokeOtherSessions(userId: string, keepSessionId: string | null): Promise<void> {
  await getDb()
    .update(schema.sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(schema.sessions.userId, userId),
        isNull(schema.sessions.revokedAt),
        keepSessionId ? ne(schema.sessions.id, keepSessionId) : undefined,
      ),
    );
}
