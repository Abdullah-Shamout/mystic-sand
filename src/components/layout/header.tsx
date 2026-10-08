"use client";

import { ChevronDown, Globe, Menu, ReceiptText, Search, ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useMounted } from "@/lib/hooks";
import { useBagCount } from "@/store/bag";
import { useUi } from "@/store/ui";
import { LanguageSwitcher } from "./language-switcher";
import { navItems, type NavItem } from "./nav-config";

function BagButton() {
  const t = useTranslations("common");
  const mounted = useMounted();
  const count = useBagCount();
  const openBag = useUi((s) => s.openBag);
  const shown = mounted ? count : 0;
  return (
    <button
      type="button"
      onClick={openBag}
      className="relative inline-flex size-11 items-center justify-center transition-opacity hover:opacity-70"
      aria-label={t("header.bagWithCount", { count: shown })}
      data-testid="bag-button"
    >
      <ShoppingBag className="size-[22px]" strokeWidth={1.25} aria-hidden />
      {shown > 0 && (
        <span
          aria-hidden
          className="figures absolute end-0.5 top-1 inline-flex min-w-[17px] items-center justify-center rounded-full bg-racing px-1 text-[10px] leading-[17px] text-cream"
        >
          {shown}
        </span>
      )}
    </button>
  );
}

function NavDropdown({ item, active }: { item: NavItem; active: boolean }) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const label = t(`nav.${item.label}`);

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hide = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 140);
  };

  const underline = (on: boolean) =>
    cn(
      "pointer-events-none absolute inset-x-0 -bottom-px h-[2px] transition-colors",
      on ? "bg-ink" : "bg-transparent",
    );

  if (!item.children) {
    return (
      <li className="relative">
        <Link
          href={item.href}
          className="caps relative flex h-12 items-center text-[14px] transition-opacity hover:opacity-70"
          aria-current={active ? "page" : undefined}
        >
          {label}
          <span className={underline(active)} />
        </Link>
      </li>
    );
  }

  return (
    <li
      className="relative"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hide();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
          (e.currentTarget.querySelector("button") as HTMLButtonElement | null)?.focus();
        }
      }}
    >
      <button
        type="button"
        className="caps relative flex h-12 items-center gap-1 text-[14px]"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} strokeWidth={1.25} aria-hidden />
        <span className={underline(open || active)} />
      </button>
      {open && (
        <div className="absolute start-1/2 top-full z-50 w-[300px] -translate-x-1/2 animate-drop-in bg-ivory py-4 rtl:translate-x-1/2">
          <ul>
            {item.children.map((child) => (
              <li key={`${child.href}-${child.label ?? child.name}`}>
                <Link
                  href={child.href}
                  onClick={() => setOpen(false)}
                  className="block px-8 py-2.5 text-[14px] text-ink/75 transition-colors hover:text-ink"
                >
                  {child.name ? <bdi lang="en">{child.name}</bdi> : t(`nav.${child.label}`)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

/**
 * Amouage-style header: solid ivory, always sticky (not transparent over the hero).
 * Desktop: utility row (country + language · centred logo · search, orders, bag),
 * then a centred navigation row. Mobile: menu · logo · search + bag.
 */
export function Header() {
  const t = useTranslations("common");
  const pathname = usePathname();
  const setSearchOpen = useUi((s) => s.setSearchOpen);
  const setMenuOpen = useUi((s) => s.setMenuOpen);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-ivory text-ink">
      {/* Mobile */}
      <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center px-2 lg:hidden">
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="inline-flex size-11 items-center justify-center"
            aria-label={t("header.menu")}
          >
            <Menu className="size-[22px]" strokeWidth={1.25} />
          </button>
        </div>
        <Link href="/" aria-label={t("header.home")} className="flex items-center px-2">
          <Logo variant="full" className="h-11 w-auto" title={t("brand")} />
        </Link>
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="inline-flex size-11 items-center justify-center"
            aria-label={t("header.search")}
          >
            <Search className="size-[21px]" strokeWidth={1.25} />
          </button>
          <BagButton />
        </div>
      </div>

      {/* Desktop */}
      <div className="mx-auto hidden max-w-[1720px] px-6 lg:block">
        <div className="grid h-[88px] grid-cols-[1fr_auto_1fr] items-center">
          <div className="flex items-center gap-6 text-[14px]">
            <span className="inline-flex items-center gap-2 font-light">
              <Globe className="size-[18px]" strokeWidth={1.25} aria-hidden />
              {t("header.country")}
            </span>
            <span aria-hidden className="h-4 w-px bg-ink/25" />
            <LanguageSwitcher />
          </div>
          <Link href="/" aria-label={t("header.home")} className="flex items-center">
            <Logo variant="full" className="h-[64px] w-auto" title={t("brand")} />
          </Link>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="me-4 inline-flex min-h-11 items-center gap-2 text-[14px] transition-opacity hover:opacity-70"
            >
              <Search className="size-5" strokeWidth={1.25} aria-hidden />
              {t("header.search")}
            </button>
            <Link
              href="/orders"
              className="inline-flex size-11 items-center justify-center transition-opacity hover:opacity-70"
              aria-label={t("header.orders")}
            >
              <ReceiptText className="size-[21px]" strokeWidth={1.25} />
            </Link>
            <BagButton />
          </div>
        </div>
        <nav aria-label={t("nav.main")}>
          <ul className="mx-auto flex max-w-[910px] items-center justify-between">
            {navItems.map((item) => (
              <NavDropdown key={item.key} item={item} active={isActive(item.href)} />
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
