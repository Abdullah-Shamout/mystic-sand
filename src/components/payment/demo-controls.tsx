"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import type { DemoOutcome } from "@/components/layout/demo-helpers";
import { RadioCard } from "@/components/ui/form";

const OPTIONS: Array<{ value: DemoOutcome; key: "captured" | "notCaptured" | "canceled" | "pending" }> = [
  { value: "CAPTURED", key: "captured" },
  { value: "NOT CAPTURED", key: "notCaptured" },
  { value: "CANCELED", key: "canceled" },
  { value: "PENDING", key: "pending" },
];

/** Presenter panel: picks how this simulated payment ends. Collapsed by default. */
export function DemoControls({ value, onChange }: { value: DemoOutcome; onChange: (value: DemoOutcome) => void }) {
  const t = useTranslations("payment.demo");
  return (
    <details className="group mt-6 border border-dashed border-ink/30 print:hidden" data-testid="demo-controls">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 text-[14px] [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <SlidersHorizontal className="size-4" strokeWidth={1.25} aria-hidden />
          {t("title")}
        </span>
        <span className="inline-flex items-center gap-2 text-[12px] text-muted">
          <bdi lang="en">{value}</bdi>
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" strokeWidth={1.25} aria-hidden />
        </span>
      </summary>
      <div className="border-t border-dashed border-ink/30 px-5 pt-4 pb-5">
        <p className="text-[13px] leading-relaxed text-muted">{t("hint")}</p>
        <fieldset className="mt-4">
          <legend className="text-[14px] font-medium">{t("legend")}</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {OPTIONS.map((o) => (
              <RadioCard
                key={o.value}
                name="demo-outcome"
                value={o.value}
                checked={value === o.value}
                onChange={() => onChange(o.value)}
                title={o.value}
                description={t(o.key)}
                data-testid={`demo-outcome-${o.key}`}
              />
            ))}
          </div>
        </fieldset>
      </div>
    </details>
  );
}
