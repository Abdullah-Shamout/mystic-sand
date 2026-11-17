import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// ── Security response headers (OWASP A05: Security Misconfiguration) ──────────────────────────────
// A STATIC Content-Security-Policy, delivered as a response header for EVERY route via headers()
// below. We deliberately avoid a per-request nonce (Next's proxy / dynamic-render CSP): a nonce forces
// every HTML route to render dynamically, which would regress the storefront's Static (○) / SSG (●)
// routes. See node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md ("Without
// Nonces"), which sanctions this exact static-headers() approach. The app renders no raw user HTML —
// everything goes through React auto-escaping, and the only sanitised HTML is the jsPDF → DOMPurify
// receipt — so a static policy with 'unsafe-inline' for Next's inline bootstrap/hydration scripts keeps
// the stored-XSS surface minimal while every other directive still adds defense-in-depth.
//
// 'unsafe-eval' is added in DEVELOPMENT ONLY: React uses eval() to rebuild server error stacks in the
// browser (per the Next doc). Production (`next build` / `next start`, including the Playwright run)
// never gets it — the CSP spec asserts the enforced header carries no 'unsafe-eval' on static, dynamic
// and admin routes.
const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  // Next injects inline bootstrap / hydration <script> blocks (self.__next_f.push(...)) with no nonce;
  // their payload is per-page, so a stable hash set is not feasible without a nonce → 'unsafe-inline'.
  // Production carries NO 'unsafe-eval' (React only needs it for the dev error overlay).
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // Tailwind v4 + the inline style attributes React sets (the Home-editor iframe, the off-screen
  // receipt wrapper, scaled previews).
  "style-src 'self' 'unsafe-inline'",
  // data: — the logo / placeholders and the html-to-image SVG snapshot behind the PDF receipt.
  // blob: — client-side image previews.
  "img-src 'self' data: blob:",
  // next/font self-hosts the Google fonts under /_next/static/media (same-origin).
  "font-src 'self'",
  // Same-origin fetches only: the image-upload POST (/api/admin/images) and html-to-image inlining
  // the receipt's images before it snapshots them.
  "connect-src 'self'",
  // The home hero / brand-film videos are served same-origin from /videos; blob: covers any
  // client-generated media source.
  "media-src 'self' blob:",
  // write-excel-file (browser build) zips through fflate's async zip(), which runs the deflate in a
  // Web Worker created from a blob: URL whenever a file in the archive is >= 160 KB (a large Orders
  // export). Without blob: here the worker is blocked (worker-src falls back to default-src 'self')
  // and the export fails. Verified by the CSP spec's large-export case.
  "worker-src 'self' blob:",
  // The Home-editor live-preview iframe and the sandbox pay page are both same-origin.
  "frame-src 'self'",
  // 'self', NOT 'none': the Home editor embeds the storefront in a same-origin iframe, so 'none'
  // would break the live preview.
  "frame-ancestors 'self'",
  // 'self' for now. PHASE 9: add the REAL payment provider's hosted-page domain here so the checkout
  // can POST to the hosted KNET / Apple Pay / Google Pay page.
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Legacy companion to frame-ancestors 'self' for older browsers. SAMEORIGIN, not DENY: the Home
  // editor embeds the storefront in a same-origin iframe.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Disable the device features the app never uses. KEEP payment=(self): Apple Pay / Google Pay need
  // the Payment Request API, so disabling it would break the locked-in wallet methods.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
];
// NOTE: HSTS (Strict-Transport-Security) and upgrade-insecure-requests are intentionally NOT set here.
// They belong at the Caddy edge (Phase 9); in-app they would break the http://localhost Playwright /
// dev server.

const nextConfig: NextConfig = {
  // Keep trailing slashes on every URL: the e2e suite and the locale redirect assume them.
  trailingSlash: true,
  // sharp is a native module (used by the image-upload route to re-encode); keep it external so it
  // is loaded from node_modules at runtime instead of being bundled.
  serverExternalPackages: ["sharp"],
  // TODO(phase later): enable next/image optimization. The storefront serves pre-generated
  // responsive images through asset(), so the optimizer stays off for now.
  images: { unoptimized: true },
  // Tailwind v4 is wired through this Turbopack loader (there is no PostCSS config).
  // Building with --webpack would silently drop Tailwind.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Static security headers on every route (CSP + friends). See the block above.
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default createNextIntlPlugin()(nextConfig);
