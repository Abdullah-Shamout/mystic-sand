import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

// Next 16 renamed Middleware to Proxy (see node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md).
// next-intl's handler runs here to redirect "/" → "/{locale}" using the NEXT_LOCALE cookie,
// then the Accept-Language header, then the default locale (en) — the server-side replacement
// for the old inline <script> redirect. It also keeps NEXT_LOCALE in sync as the language
// switcher navigates, so a returning visitor lands on their chosen locale.
export default createMiddleware(routing);

export const config = {
  // Run on every request except Next internals and any path with a file extension
  // (assets, _next, favicon, etc.). "/" matches, so the locale redirect fires there.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
