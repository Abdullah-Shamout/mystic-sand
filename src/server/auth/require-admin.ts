import "server-only";

// Admin authorization gate.
//
// TODO(Phase 4): real server-side auth. This is a PLACEHOLDER. Phase 4 replaces the body with the
// DAL check — `const session = await verifySession(); if (session?.role !== "admin") throw/403` —
// and NOTHING else changes, because every admin Server Action and admin Route Handler already calls
// requireAdmin() at its top (image upload/list/delete, saveSettings, and the Phase 3b/3c writes).
// Keep it async so callers `await requireAdmin()` and the Phase 4 swap is a one-function change.
//
// Until then this is intentionally a no-op: the admin area is still gated only by the existing
// client-side login (src/lib/admin-auth.ts), which Phase 4 removes.
export async function requireAdmin(): Promise<void> {
  // TODO(Phase 4): real server-side auth — replace this no-op with verifySession() + role check.
}
