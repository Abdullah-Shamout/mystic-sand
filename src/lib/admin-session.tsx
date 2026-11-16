"use client";

import { createContext, useContext } from "react";

// Whether THIS request is an authenticated admin. Computed on the server by verifySession() in the
// locale layout and handed to the storefront header so the entry reads "Admin" (a link) instead of
// "Enter" (the sign-in dialog). The session cookie is httpOnly, so the client can't read it directly
// — this boolean is the only signal it gets. It is a UI affordance, not a security boundary (the
// admin area is gated server-side by the admin layout + requireAdmin()).

const AdminSessionContext = createContext<boolean>(false);

export function AdminSessionProvider({
  isAdmin,
  children,
}: {
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  return <AdminSessionContext.Provider value={isAdmin}>{children}</AdminSessionContext.Provider>;
}

/** True when the current viewer is signed in as an admin (optimistic, server-computed). */
export function useIsAdmin(): boolean {
  return useContext(AdminSessionContext);
}
