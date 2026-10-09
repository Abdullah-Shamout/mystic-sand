"use client";

import { Menu, ReceiptText, Search, ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";
import { AdminEntry } from "@/components/admin/admin-entry";
import { Logo } from "@/components/brand/logo";
import { Link } from "@/i18n/navigation";
import { useMounted } from "@/lib/hooks";
import { useBagCount } from "@/store/bag";
import { useUi } from "@/store/ui";
import { LanguageSwitcher } from "./language-switcher";

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

/**
 * Solid ivory header, always sticky (not transparent over the hero), one row on every
 * screen: the ☰ menu with the collections (and the language from lg) · the logo, which
 * leads home · search, orders and the bag. It is 64px tall, 88px from lg, plus a 1px
 * hairline; full-height panels subtract that and the 40px ticker.
 */
export function Header() {
  const t = useTranslations("common");
  const setSearchOpen = useUi((s) => s.setSearchOpen);
  const menuOpen = useUi((s) => s.menuOpen);
  const setMenuOpen = useUi((s) => s.setMenuOpen);

  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-ivory text-ink">
      <div className="mx-auto grid h-16 max-w-[1720px] grid-cols-[1fr_auto_1fr] items-center px-2 lg:h-[88px] lg:px-6">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label={t("header.menu")}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2.5 transition-opacity hover:opacity-70 lg:-ms-2.5 lg:px-2.5"
            data-testid="menu-button"
          >
            <Menu className="size-[22px]" strokeWidth={1.25} aria-hidden />
            <span aria-hidden className="caps hidden text-[14px] lg:inline">
              {t("header.menu")}
            </span>
          </button>
          <span aria-hidden className="hidden h-4 w-px bg-ink/25 lg:block" />
          <div className="hidden lg:block">
            <LanguageSwitcher />
          </div>
        </div>

        <Link href="/" aria-label={t("header.home")} className="flex items-center px-1 lg:px-2">
          <Logo variant="full" className="h-11 w-auto lg:h-[64px]" title={t("brand")} />
        </Link>

        <div className="flex items-center justify-end lg:gap-2">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label={t("header.search")}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 text-[14px] transition-opacity hover:opacity-70 lg:me-4"
          >
            <Search className="size-[21px] lg:size-5" strokeWidth={1.25} aria-hidden />
            <span aria-hidden className="hidden lg:inline">
              {t("header.search")}
            </span>
          </button>
          <Link
            href="/orders"
            className="hidden size-11 items-center justify-center transition-opacity hover:opacity-70 lg:inline-flex"
            aria-label={t("header.orders")}
          >
            <ReceiptText className="size-[21px]" strokeWidth={1.25} />
          </Link>
          <BagButton />
          <AdminEntry />
        </div>
      </div>
    </header>
  );
}
