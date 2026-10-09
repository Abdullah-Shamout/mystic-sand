"use client";

import { cn } from "@/lib/cn";

/**
 * A single KPI tile: a caps label (with the period it covers), a large figure in the sans font,
 * and an optional sub-line. Figures use the tabular-figures utility.
 */
export function KpiTile({
  label,
  period,
  value,
  sub,
  className,
  testId,
}: {
  label: string;
  period?: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div className={cn("border border-line bg-paper p-4", className)} data-testid={testId}>
      <p className="caps text-[12px] leading-snug text-muted">
        {label}
        {period && <span className="text-muted/80"> · {period}</span>}
      </p>
      <p
        className="figures mt-2 font-sans text-[22px] leading-none font-medium text-ink sm:text-[24px]"
        data-testid={testId ? `${testId}-value` : undefined}
      >
        {value}
      </p>
      {sub && <p className="mt-1.5 text-[12px] leading-snug text-muted">{sub}</p>}
    </div>
  );
}
