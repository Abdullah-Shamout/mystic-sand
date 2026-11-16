"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { passwordIsStrong } from "@/lib/password-policy";
import { dummyHash, hashPassword, verifyPassword } from "@/server/auth/password";
import { clearFailures, isLockedOut, recordFailure } from "@/server/auth/rate-limit";
import {
  createSession,
  destroySession,
  getCurrentSessionId,
  revokeOtherSessions,
  verifySession,
} from "@/server/auth/session";
import { getDb, schema } from "@/server/db";

// Auth Server Actions. login + changePassword RETURN a result object (never throw): the suite runs a
// production build, where a thrown action's message is redacted to a generic string the client can't
// read. logout uses redirect(), which must stay outside any try/catch.

const LOCALES = ["en", "ar"] as const;
type AppLocale = (typeof LOCALES)[number];

export type LoginResult = { ok: true; redirect: string } | { ok: false; error: "invalid" | "locked" };
export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error: "unauthorized" | "current" | "weak" | "same" };

const loginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
  remember: z.boolean().optional(),
  next: z.string().max(512).optional(),
  locale: z.enum(LOCALES).optional(),
});

const changePasswordSchema = z.object({
  current: z.string().min(1).max(200),
  next: z.string().min(1).max(200),
});

/** First client IP from the proxy headers, for the rate-limit key. */
async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

/** A safe post-login path: a same-site admin route under the right locale, else the admin home.
 * Rejects absolute URLs, protocol-relative (`//`) and backslash tricks — no open redirect. */
function safeNext(next: string | undefined, locale: AppLocale): string {
  const fallback = `/${locale}/admin/`;
  if (!next) return fallback;
  if (next.includes("\\") || next.includes("//")) return fallback;
  if (!/^\/(en|ar)\/admin(\/|$|\?)/.test(next)) return fallback;
  return next;
}

/**
 * Verifies credentials and starts a session. Rate-limited + locked out per username+IP. Runs the
 * password hash even when the user is absent (against a dummy hash) so timing doesn't reveal which
 * usernames exist, and returns one generic error for every failure (never reveals which field was
 * wrong, never enumerates users).
 */
export async function login(input: {
  username: string;
  password: string;
  remember?: boolean;
  next?: string;
  locale?: AppLocale;
}): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { username, password, remember } = parsed.data;
  const locale: AppLocale = parsed.data.locale ?? "en";

  const user = username.trim().toLowerCase();
  const key = `${user}|${await clientIp()}`;
  if (isLockedOut(key)) return { ok: false, error: "locked" };

  const [row] = await getDb()
    .select()
    .from(schema.adminUsers)
    .where(eq(schema.adminUsers.username, user))
    .limit(1);

  // Always run a full verify — against the row's hash, or a dummy hash on a miss — so the response
  // time is the same whether or not the username exists.
  const hashToCheck = row?.passwordHash ?? (await dummyHash());
  const passwordOk = await verifyPassword(hashToCheck, password);

  if (!row || !passwordOk || row.role !== "admin") {
    recordFailure(key);
    return { ok: false, error: "invalid" };
  }

  clearFailures(key);
  const userAgent = (await headers()).get("user-agent");
  await createSession(row.id, { remember: remember ?? false, userAgent });
  return { ok: true, redirect: safeNext(parsed.data.next, locale) };
}

/** Clears the session and sends the browser to the login page. */
export async function logout(locale?: AppLocale): Promise<void> {
  await destroySession();
  const safe: AppLocale = locale === "ar" ? "ar" : "en";
  redirect(`/${safe}/login/`);
}

/**
 * Changes the signed-in admin's password: checks the current password, enforces the strong policy on
 * the new one (and that it differs), rotates the hash + passwordChangedAt, and revokes every OTHER
 * session so other devices are signed out. Generic errors; never throws.
 */
export async function changePassword(input: {
  current: string;
  next: string;
}): Promise<ChangePasswordResult> {
  const session = await verifySession();
  if (!session || session.role !== "admin") return { ok: false, error: "unauthorized" };

  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "weak" };
  const { current, next } = parsed.data;

  const db = getDb();
  const [row] = await db
    .select({ passwordHash: schema.adminUsers.passwordHash })
    .from(schema.adminUsers)
    .where(eq(schema.adminUsers.id, session.userId))
    .limit(1);
  if (!row) return { ok: false, error: "unauthorized" };

  if (!(await verifyPassword(row.passwordHash, current))) return { ok: false, error: "current" };
  if (!passwordIsStrong(next)) return { ok: false, error: "weak" };
  if (await verifyPassword(row.passwordHash, next)) return { ok: false, error: "same" };

  const now = new Date();
  const newHash = await hashPassword(next);
  await db
    .update(schema.adminUsers)
    .set({ passwordHash: newHash, passwordChangedAt: now, updatedAt: now })
    .where(eq(schema.adminUsers.id, session.userId));

  await revokeOtherSessions(session.userId, await getCurrentSessionId());
  return { ok: true };
}
