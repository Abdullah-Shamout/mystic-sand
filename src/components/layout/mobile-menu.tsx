"use client";

import { ChevronDown, ReceiptText } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { InstagramIcon, WhatsAppIcon } from "@/components/brand/brand-icons";
import { Drawer } from "@/components/ui/drawer";
import { site, whatsappLink } from "@/data/site";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useUi } from "@/store/ui";
import { LanguageSwitcher } from "./language-switcher";
import { navItems } from "./nav-config";

export function MobileMenu() {
  const t = useTranslations("common");
  const open = useUi((s) => s.menuOpen);
  const setOpen = useUi((s) => s.setMenuOpen);
  const [expanded, setExpanded] = useState<string | null>("perfumes");
  const close = () => setOpen(false);

  return (
    <Drawer
      open={open}
      onOpenChange={setOpen}
      title={t("header.menu")}
      hideTitle
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
      <nav aria-label={t("nav.main")} className="px-6 py-4">
        <ul className="divide-y divide-line">
          {navItems.map((item) => (
            <li key={item.key}>
              {item.children ? (
                <>
                  <button
                    type="button"
                    className="caps flex min-h-14 w-full items-center justify-between text-start text-[17px]"
                    aria-expanded={expanded === item.key}
                    onClick={() => setExpanded(expanded === item.key ? null : item.key)}
                  >
                    {t(`nav.${item.label}`)}
                    <ChevronDown
                      className={cn("size-4 transition-transform", expanded === item.key && "rotate-180")}
                      strokeWidth={1.25}
                      aria-hidden
                    />
                  </button>
                  {expanded === item.key && (
                    <ul className="pb-4">
                      {item.children.map((child) => (
                        <li key={`${child.href}-${child.label ?? child.name}`}>
                          <Link
                            href={child.href}
                            onClick={close}
                            className="flex min-h-11 items-center ps-3 text-[16px] text-ink/80"
                          >
                            {child.name ? <bdi lang="en">{child.name}</bdi> : t(`nav.${child.label}`)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <Link href={item.href} onClick={close} className="caps flex min-h-14 items-center text-[17px]">
                  {t(`nav.${item.label}`)}
                </Link>
              )}
            </li>
          ))}
          <li>
            <Link href="/contact" onClick={close} className="caps flex min-h-14 items-center text-[17px]">
              {t("nav.contact")}
            </Link>
          </li>
        </ul>
      </nav>
    </Drawer>
  );
}
