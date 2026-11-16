import "server-only";

import { verifySession, type SessionUser } from "./session";

// Admin authorization gate. Every admin Server Action and the image-upload Route Handler call this
// FIRST. It is the authoritative (DB-backed) check: verifySession() confirms the cookie maps to a
// live, non-revoked, non-expired session row whose user is an admin.
//
// Server Actions let it throw — the admin editors already try/catch and surface a toast. The image
// route catches UnauthorizedError and maps it to a 401 (a denial must be 401/403, never 500).

/** Thrown by requireAdmin() when there is no admin session. */
export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Resolves to the admin session, or throws UnauthorizedError. */
export async function requireAdmin(): Promise<SessionUser> {
  const session = await verifySession();
  if (!session || session.role !== "admin") throw new UnauthorizedError();
  return session;
}
