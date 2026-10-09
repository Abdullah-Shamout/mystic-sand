"use client";

import { ChevronRight, ReceiptText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { InstagramIcon, WhatsAppIcon } from "@/components/brand/brand-icons";
import { Drawer } from "@/components/ui/drawer";
import { categories } from "@/data/categories";
import { site, whatsappLink } from "@/data/site";
import { Link, usePathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { useUi } from "@/store/ui";
import { LanguageSwitcher } from "./language-switcher";

/**
 * The ☰ menu, on every screen size: the four collections — Perfumes, Oud, Body, Home —
 * each its own page, and nothing nested under them. Orders, language and social links
 * sit in the footer.
 */
export function SiteMenu() {
  const t = useTranslations("common");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const open = useUi((s) => s.menuOpen);
  const setOpen = useUi((s) => s.setMenuOpen);
  const close = () => setOpen(false);

  return (
    <Drawer
      open={open}
      onOpenChange={setOpen}
      title={t("header.menu")}
      side="start"
      width="max-w-[420px]"
      className="bg-paper"
      footer={
        <div className="flex flex-col gap-4 px-6 py-5">
          <Link href="/orders" onClick={close} className="inline-flex min-h-11 items-center gap-3 text-[15px]">
            <ReceiptText className="size-5" strokeWidth={1.25} aria-hidden />
            {t("header.orders")}
          </Link>
          <div className="flex items-center justify-between border-t border-line pt-4">
            <LanguageSwitcher />
            <div className="flex items-center gap-1">
              <a
                href={site.instagram.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex size-11 items-center justify-center"
                aria-label="Instagram"
              >
                <InstagramIcon className="size-5" />
              </a>
              <a
                href={whatsappLink(t("brand"))}
                target="_blank"
                rel="noreferrer"
                className="inline-flex size-11 items-center justify-center"
                aria-label={t("footer.whatsapp")}
              >
                <WhatsAppIcon className="size-5" />
              </a>
            </div>
          </div>
        </div>
      }
    >
      <nav aria-label={t("nav.main")} className="px-6 py-6">
        <ul className="divide-y divide-line border-y border-line">
          {categories.map((category) => {
            const href = `/shop/${category.slug}`;
            const current = pathname === href || pathname === `${href}/`;
            return (
              <li key={category.slug}>
                <Link
                  href={href}
                  onClick={close}
                  aria-current={current ? "page" : undefined}
                  className="group flex min-h-[72px] items-center justify-between gap-4"
                >
                  <span className="caps font-serif text-[26px] leading-tight font-medium decoration-1 underline-offset-[6px] group-hover:underline group-aria-[current=page]:underline">
                    {category.name[locale]}
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted rtl:-scale-x-100" strokeWidth={1.25} aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </Drawer>
  );
}
