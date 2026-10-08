"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import { formatKWD } from "@/lib/money";

/**
 * A KWD amount, isolated with <bdi> so it never reorders surrounding Arabic text.
 * `free` renders "Free" / "مجاناً" for zero amounts (delivery lines).
 */
export function Price({
  fils,
  free = false,
  className,
  strike = false,
}: {
  fils: number;
  free?: boolean;
  className?: string;
  strike?: boolean;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations("common");
  if (free && fils === 0) return <span className={className}>{t("free")}</span>;
  return (
    <bdi className={cn("figures whitespace-nowrap", strike && "line-through", className)}>{formatKWD(fils, locale)}</bdi>
  );
}
