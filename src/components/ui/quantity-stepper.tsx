"use client";

import { Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

export function QuantityStepper({
  value,
  min = 1,
  max,
  onChange,
  label,
  size = "md",
  className,
}: {
  value: number;
  min?: number;
  max: number;
  onChange: (next: number) => void;
  /** Product name for the accessible labels. */
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const t = useTranslations("common");
  const box = size === "sm" ? "h-9" : "h-11";
  const btn = size === "sm" ? "w-9" : "w-11";
  return (
    <div
      role="group"
      aria-label={t("quantityFor", { name: label })}
      className={cn("inline-flex items-stretch border border-line bg-tile", box, className)}
    >
      <button
        type="button"
        className={cn("inline-flex items-center justify-center transition-colors hover:bg-sand/40 disabled:opacity-35", btn)}
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label={t("decrease")}
      >
        <Minus className="size-3.5" strokeWidth={1.5} />
      </button>
      <output aria-live="polite" className="figures flex min-w-9 items-center justify-center text-[15px]">
        {value}
      </output>
      <button
        type="button"
        className={cn("inline-flex items-center justify-center transition-colors hover:bg-sand/40 disabled:opacity-35", btn)}
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label={value >= max ? t("maxReached") : t("increase")}
      >
        <Plus className="size-3.5" strokeWidth={1.5} />
      </button>
    </div>
  );
}
