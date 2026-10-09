"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/routing";
import { expressWindow } from "@/components/content/values";
import { delivery } from "@/data/site";
import { cn } from "@/lib/cn";
import { isolatedKWD } from "@/lib/money";

/**
 * Green announcement ticker (Amouage: dark bar above the header, slow rotation).
 * The outgoing message rises and fades out first; the next one rises in after it,
 * so two messages never overlap mid-transition.
 */
export function AnnouncementBar() {
  const t = useTranslations("common");
  const locale = useLocale() as Locale;
  const messages = [
    t("announcement.delivery", { amount: isolatedKWD(delivery.standard.freeOverFils, locale) }),
    t("announcement.payment"),
    t("announcement.express", { window: expressWindow(locale) }),
  ];
  const [{ current, previous }, setState] = useState<{ current: number; previous: number | null }>({
    current: 0,
    previous: null,
  });
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(
      () => setState((s) => ({ current: (s.current + 1) % messages.length, previous: s.current })),
      5000,
    );
    return () => clearInterval(id);
  }, [paused, messages.length]);

  return (
    <div
      className="relative z-40 bg-racing text-cream"
      role="region"
      aria-label={t("announcement.label")}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="relative mx-auto flex h-10 max-w-[1720px] items-center justify-center overflow-hidden px-6 text-center text-[13px] md:text-[14px]">
        {messages.map((m, i) => {
          const state = i === current ? "current" : i === previous ? "previous" : "waiting";
          return (
            <p
              key={m}
              aria-hidden={state !== "current"}
              className={cn(
                "absolute inset-x-6 truncate ease-[var(--ease-soft)]",
                state === "current" && "translate-y-0 opacity-100 transition-all delay-300 duration-500",
                state === "previous" && "-translate-y-3 opacity-0 transition-all duration-300",
                state === "waiting" && "translate-y-3 opacity-0",
              )}
            >
              {m}
            </p>
          );
        })}
      </div>
    </div>
  );
}
