"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/routing";
import { delivery } from "@/data/site";
import { isolatedKWD } from "@/lib/money";

/** Green announcement ticker (Amouage: dark bar above the header, slow rotation). */
export function AnnouncementBar() {
  const t = useTranslations("common");
  const locale = useLocale() as Locale;
  const messages = [
    t("announcement.delivery", { amount: isolatedKWD(delivery.standard.freeOverFils, locale) }),
    t("announcement.payment"),
    t("announcement.gift"),
  ];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % messages.length), 4500);
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
        {messages.map((m, i) => (
          <p
            key={m}
            aria-hidden={i !== index}
            className="absolute inset-x-6 truncate transition-all duration-700 ease-[var(--ease-soft)] data-[active=false]:translate-y-3 data-[active=false]:opacity-0"
            data-active={i === index}
          >
            {m}
          </p>
        ))}
      </div>
    </div>
  );
}
