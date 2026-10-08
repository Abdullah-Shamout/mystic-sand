"use client";

import { ArrowLeft, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/brand/logo";
import { Link } from "@/i18n/navigation";
import { useUi } from "@/store/ui";
import { LanguageSwitcher } from "./language-switcher";

/** Stripped-down header for checkout, payment and result pages. */
export function CheckoutHeader({ showBack = true }: { showBack?: boolean }) {
  const t = useTranslations("common");
  const openBag = useUi((s) => s.openBag);
  return (
    <header className="border-b border-ink/10 bg-ivory">
      <div className="mx-auto grid h-16 max-w-[1200px] grid-cols-[1fr_auto_1fr] items-center px-4 md:h-20 md:px-6">
        <div className="flex items-center">
          {showBack && (
            <button
              type="button"
              onClick={openBag}
              className="inline-flex min-h-11 items-center gap-2 text-[14px] hover:underline"
            >
              <ArrowLeft className="size-4 rtl:-scale-x-100" strokeWidth={1.25} aria-hidden />
              <span className="hidden sm:inline">{t("header.backToBag")}</span>
              <span className="sr-only sm:hidden">{t("header.backToBag")}</span>
            </button>
          )}
        </div>
        <Link href="/" aria-label={t("header.home")}>
          <Logo variant="full" className="h-11 w-auto md:h-14" title={t("brand")} />
        </Link>
        <div className="flex items-center justify-end gap-4">
          <span className="hidden items-center gap-1.5 text-[13px] text-muted sm:inline-flex">
            <Lock className="size-3.5" strokeWidth={1.5} aria-hidden />
            {t("header.secureCheckout")}
          </span>
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}
