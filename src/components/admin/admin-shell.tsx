"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Logo } from "@/components/brand/logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { endAdminSession, useAdminSession } from "@/lib/admin-auth";
import { cn } from "@/lib/cn";
import { useMounted } from "@/lib/hooks";
import { useAdminStore } from "@/store/admin";
import { useUi } from "@/store/ui";
import { LoginForm } from "./login-form";

const TABS = [
  { href: "/admin", key: "orders" },
  { href: "/admin/products", key: "products" },
  { href: "/admin/stock", key: "stock" },
  { href: "/admin/analysis", key: "analysis" },
  { href: "/admin/settings", key: "settings" },
] as const;

/**
 * The back-office chrome. A skeleton until mounted (the session is browser-only), then
 * either a full-page sign-in or the signed-in shell. Everything is saved in this browser
 * only — the notice band and the sign-in note say so.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const mounted = useMounted();
  const session = useAdminSession();
  const pathname = usePathname();
  const router = useRouter();
  const pushToast = useUi((s) => s.pushToast);

  // Seed the demo orders once, after sign-in (no-op if already seeded or cleared). "now" is read
  // inside the effect, never during render.
  useEffect(() => {
    if (!session) return;
    useAdminStore.getState().seedSamples(new Date().toISOString());
  }, [session]);

  if (!mounted) return <AdminSkeleton />;

  if (!session) {
    return (
      <main id="main" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16 outline-none">
        <h1 className="caps font-serif text-title font-medium">{t("signInTitle")}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">{tc("login.demoNote")}</p>
        <div className="mt-8">
          <LoginForm autoFocus />
        </div>
      </main>
    );
  }

  const clean = pathname.replace(/\/+$/, "") || "/";
  const isActive = (href: string) => clean === href || (href !== "/admin" && clean.startsWith(`${href}/`));

  const logout = () => {
    endAdminSession();
    pushToast({ title: tc("login.signedOut") });
    router.push("/");
  };

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
              onClick={logout}
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

function AdminSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="border-b border-line bg-ivory">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 lg:px-6">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="ms-auto h-6 w-40" />
        </div>
        <div className="mx-auto flex max-w-[1400px] gap-2 px-4 pb-3 lg:px-6">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-20" />
        </div>
      </div>
      <div className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-8 lg:px-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="mt-4 h-5 w-80 max-w-full" />
      </div>
    </div>
  );
}
