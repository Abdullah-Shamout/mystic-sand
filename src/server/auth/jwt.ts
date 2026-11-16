import { SignJWT, jwtVerify, type JWTPayload } from "jose";

// Edge-safe JWT sign/verify for the session cookie. jose is isomorphic (works in the Node runtime
// AND the Edge runtime the Proxy runs on), so this module has NO "server-only" and NO DB import:
// session.ts (Node) uses it to mint tokens, and proxy.ts (Edge) uses it for the optimistic check.
//
// The token carries only { sid, role } plus the standard exp — never a password or PII. The signing
// key is resolved lazily (never at import time) and fails closed, so the DB-free production build —
// which runs with SESSION_SECRET unset — never touches it, while a real request without a secret
// cannot mint or trust a session.

export type SessionTokenPayload = JWTPayload & { sid: string; role: string };

let cachedKey: Uint8Array | undefined;

/** The HMAC key from SESSION_SECRET. Throws (fail closed) if it is missing or too short. */
function getKey(): Uint8Array {
  if (cachedKey) return cachedKey;
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET is missing or too short (need at least 32 characters).");
  }
  cachedKey = new TextEncoder().encode(secret);
  return cachedKey;
}

/** Signs an HS256 token whose `exp` is the session's expiry. */
export async function signSessionToken(
  payload: { sid: string; role: string },
  expiresAt: Date,
): Promise<string> {
  return new SignJWT({ sid: payload.sid, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getKey());
}

/**
 * Verifies the signature + exp and returns the payload, or null on any failure (bad signature,
 * expired, malformed, or — fail closed — a missing secret). Never throws.
 */
export async function verifySessionToken(
  token: string | undefined | null,
): Promise<SessionTokenPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getKey(), { algorithms: ["HS256"] });
    if (typeof payload.sid !== "string" || typeof payload.role !== "string") return null;
    return payload as SessionTokenPayload;
  } catch {
    return null;
  }
}
