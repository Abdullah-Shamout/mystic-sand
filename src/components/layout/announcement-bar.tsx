"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { expressWindow } from "@/components/content/values";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import { useLiveSettings } from "@/lib/live";

/**
 * Green announcement ticker (Amouage: dark bar above the header, slow rotation).
 * The outgoing message rises and fades out first; the next one rises in after it,
 * so two messages never overlap mid-transition. Uses the admin's custom messages when
 * set (per locale), otherwise the built-in ones.
 */
export function AnnouncementBar() {
  const t = useTranslations("common");
  const locale = useLocale() as Locale;
  const settings = useLiveSettings();
  const custom = settings.ticker[locale];
  const messages =
    custom.length > 0
      ? custom
      : [t("announcement.payment"), t("announcement.express", { window: expressWindow(locale) })];
  const [{ current, previous }, setState] = useState<{ current: number; previous: number | null }>({
    current: 0,
    previous: null,
  });
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || messages.length <= 1 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let settle: number | undefined;
    const park = () => setState((s) => ({ ...s, previous: null }));
    const id = setInterval(() => {
      setState((s) => ({ current: (s.current + 1) % messages.length, previous: s.current }));
      // Once the outgoing message has left (300ms), park it below again, so it rises in
      // from below next time — with two messages it is the very next one.
      window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        settle = undefined;
        park();
      }, 350);
    }, 5000);
    return () => {
      clearInterval(id);
      // Paused (hover/focus) mid-exit: park it now rather than leave it above.
      if (settle !== undefined) {
        window.clearTimeout(settle);
        park();
      }
    };
  }, [paused, messages.length]);

  // Clamp in case the message set shrank (e.g. switching to a single custom message).
  const activeIndex = current % messages.length;

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
          const state = i === activeIndex ? "current" : i === previous ? "previous" : "waiting";
          return (
            <p
              key={i}
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
