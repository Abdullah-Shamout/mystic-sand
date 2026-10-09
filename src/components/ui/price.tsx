"use client";

import { useLocale } from "next-intl";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import { formatKWD } from "@/lib/money";

/** A KWD amount, isolated with <bdi> so it never reorders surrounding Arabic text. */
export function Price({ fils, className, strike = false }: { fils: number; className?: string; strike?: boolean }) {
  const locale = useLocale() as Locale;
  return (
    <bdi className={cn("figures whitespace-nowrap", strike && "line-through", className)}>{formatKWD(fils, locale)}</bdi>
  );
}
