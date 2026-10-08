"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";

/**
 * Switches language on the same page, keeping the query string (order IDs etc.).
 * The choice is remembered for the root "/" redirect. The bag and checkout draft
 * live in localStorage, so they survive the switch.
 */
export function LanguageSwitcher({ className, tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  const locale = useLocale() as Locale;
  const target: Locale = locale === "ar" ? "en" : "ar";
  const t = useTranslations("common");
  const pathname = usePathname();
  const router = useRouter();

  return (
    <button
      type="button"
      lang={target}
      onClick={() => {
        try {
          localStorage.setItem("ms-locale", target);
        } catch {
          // storage blocked — the switch still works
        }
        const search = window.location.search;
        router.replace(`${pathname}${search}`, { locale: target, scroll: false });
      }}
      className={cn(
        "inline-flex min-h-11 items-center text-[14px] underline-offset-4 hover:underline",
        tone === "light" && "text-cream",
        className,
      )}
      aria-label={`${t("language.label")}: ${t("language.switchTo")}`}
    >
      {t("language.switchTo")}
    </button>
  );
}
