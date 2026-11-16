import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";

import { routing } from "@/i18n/routing";
import { verifySessionToken } from "@/server/auth/jwt";

// Next 16 renamed Middleware to Proxy (see node_modules/next/dist/docs/01-app/01-getting-started/
// 16-proxy.md). This composes two things:
//
//  1. next-intl's handler — redirects "/" → "/{locale}" and keeps NEXT_LOCALE in sync.
//  2. An OPTIMISTIC admin gate — for /{locale}/admin(/...), if the session cookie is missing or its
//     JWT signature/exp doesn't verify, redirect to /{locale}/login?next=<path>.
//
// This runs on the Edge runtime (no DB, no Node APIs): jose works here, Drizzle/pg does not. So the
// check is signature-only; the AUTHORITATIVE check (row exists / not revoked / not expired) stays in
// verifySession() — the admin layout and requireAdmin() in the Node runtime. This is UX, not
// security: a valid-but-revoked cookie passes here and is caught one layer in.

const intlMiddleware = createMiddleware(routing);

const ADMIN_PATH = /^\/(en|ar)\/admin(?:\/|$)/;

export default async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const adminMatch = pathname.match(ADMIN_PATH);

  if (adminMatch) {
    const token = request.cookies.get("ms_session")?.value;
    const payload = await verifySessionToken(token);
    if (!payload) {
      const locale = adminMatch[1];
      const url = request.nextUrl.clone();
      url.pathname = `/${locale}/login/`;
      url.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
      return NextResponse.redirect(url);
    }
  }

  return intlMiddleware(request);
}

export const config = {
  // Run on every request except Next internals and any path with a file extension
  // (assets, _next, favicon, etc.). "/" matches, so the locale redirect fires there. /api is
  // excluded — the upload route is gated by requireAdmin(), not the Proxy.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
