"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Logo } from "@/components/brand/logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { logout } from "@/server/actions/auth";
import { useAdminStore } from "@/store/admin";

const TABS = [
  { href: "/admin", key: "orders" },
  { href: "/admin/products", key: "products" },
  { href: "/admin/stock", key: "stock" },
  { href: "/admin/home", key: "home" },
  { href: "/admin/analysis", key: "analysis" },
  { href: "/admin/settings", key: "settings" },
] as const;

/**
 * The back-office chrome. The admin layout already gates access server-side (verifySession), so this
 * always renders the signed-in shell — no client session check, no skeleton. Logout calls the
 * `logout` Server Action, which revokes the session row, clears the cookie and redirects to /login.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();
  const activeTabRef = useRef<HTMLAnchorElement>(null);
  const clean = pathname.replace(/\/+$/, "") || "/";

  // Seed the demo sample orders once (retired with the real order system in Phase 5).
  useEffect(() => {
    useAdminStore.getState().seedSamples(new Date().toISOString());
  }, []);

  // On phones the tab bar scrolls horizontally; keep the active tab in view, and again after fonts
  // load (Arabic measures a few px wider).
  useEffect(() => {
    const scroll = () => activeTabRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
    scroll();
    document.fonts?.ready.then(scroll).catch(() => {});
  }, [clean]);

  const isActive = (href: string) => clean === href || (href !== "/admin" && clean.startsWith(`${href}/`));

  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-ivory">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 lg:px-6">
          <Link href="/admin" className="flex items-center gap-2.5 transition-opacity hover:opacity-70">
            <Logo variant="mark" className="h-8 w-auto" title={tc("brand")} />
            <span className="caps text-[14px] font-medium">{tc("header.admin")}</span>
          </Link>
          <div className="ms-auto flex items-center gap-4">
            <LanguageSwitcher />
            <Link
              href="/"
              className="caps inline-flex min-h-11 items-center text-[13px] underline-offset-4 transition-opacity hover:underline"
            >
              {t("viewStore")}
            </Link>
            <button
              type="button"
              onClick={() => void logout(locale === "ar" ? "ar" : "en")}
              data-testid="admin-logout"
              className="caps inline-flex min-h-11 items-center text-[13px] underline-offset-4 transition-opacity hover:underline"
            >
              {t("logout")}
            </button>
          </div>
        </div>
        <nav aria-label={tc("nav.main")} className="mx-auto max-w-[1400px] overflow-x-auto px-4 lg:px-6">
          <ul className="flex min-w-max gap-1 pb-px">
            {TABS.map((tab) => {
              const active = isActive(tab.href);
              return (
                <li key={tab.href}>
                  <Link
                    ref={active ? activeTabRef : undefined}
                    href={tab.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "caps inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-[13px] transition-colors",
                      active
                        ? "border-racing font-medium text-racing"
                        : "border-transparent text-muted hover:text-ink",
                    )}
                  >
                    {t(`nav.${tab.key}`)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <div className="border-b border-line bg-sand/40">
        <p className="mx-auto w-full max-w-[1400px] px-4 py-2 text-[13px] leading-snug text-ink lg:px-6">
          {t("notice")}
        </p>
      </div>

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-8 outline-none lg:px-6">
        {children}
      </main>
    </div>
  );
}
