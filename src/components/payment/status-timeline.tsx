"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

const STEPS = ["confirmed", "preparing", "shipped", "delivered"] as const;

/** Mock delivery timeline: the order has just been confirmed. Mirrors naturally in Arabic. */
export function StatusTimeline({ current = 0, className }: { current?: number; className?: string }) {
  const t = useTranslations("payment.timeline");
  return (
    <div className={cn("relative", className)}>
      {/* Hairline from the centre of the first column to the centre of the last. */}
      <span aria-hidden className="absolute inset-x-[12.5%] top-[5px] h-px bg-line" />
      <ol aria-label={t("label")} className="relative grid grid-cols-4">
        {STEPS.map((step, i) => (
          <li
            key={step}
            aria-current={i === current ? "step" : undefined}
            className="flex flex-col items-center px-1 text-center"
          >
            <span
              aria-hidden
              className={cn("size-[11px] border", i <= current ? "border-racing bg-racing" : "border-ink/35 bg-paper")}
            />
            <span
              className={cn(
                "mt-3 text-[12px] leading-snug sm:text-[13px]",
                i === current ? "font-medium text-ink" : "text-muted",
              )}
            >
              {t(step)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
