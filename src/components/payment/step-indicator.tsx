"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

const cols = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" } as Record<number, string>;

/** Segmented hairline progress: done and current segments in ink, the rest in line. */
export function StepIndicator({ labels, current }: { labels: string[]; current: number }) {
  const t = useTranslations("payment.gateway");
  return (
    <ol aria-label={t("stepsLabel")} className={cn("grid gap-2 sm:gap-3", cols[labels.length])}>
      {labels.map((label, i) => {
        const state = i < current ? "done" : i === current ? "current" : "todo";
        return (
          <li key={label} aria-current={state === "current" ? "step" : undefined} className="min-w-0">
            <span aria-hidden className={cn("block h-[2px]", state === "todo" ? "bg-line" : "bg-ink")} />
            <span
              className={cn(
                "mt-2 flex items-start gap-1.5 text-[12px] leading-snug sm:text-[13px]",
                state === "todo" ? "text-muted" : "text-ink",
                state === "current" && "font-medium",
              )}
            >
              {state === "done" ? (
                <Check className="mt-[3px] size-3 shrink-0" strokeWidth={2} aria-hidden />
              ) : (
                <span aria-hidden className="figures shrink-0">
                  {i + 1}
                </span>
              )}
              <span>
                {label}
                {state === "done" && <span className="sr-only"> ({t("completed")})</span>}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
