"use client";

import { Ban, CircleCheck, CircleDashed, CircleX, Clock, Hourglass, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import type { StatusKind } from "@/lib/admin/orders";

// A status is always an icon PLUS a label, never colour alone — colour is only a reinforcement.
const STYLES: Record<StatusKind, { icon: LucideIcon; tone: string }> = {
  done: { icon: CircleCheck, tone: "border-success/30 bg-success/10 text-success" },
  pending: { icon: Clock, tone: "border-sand-deep/40 bg-sand/25 text-ink" },
  confirming: { icon: Hourglass, tone: "border-line bg-tile text-muted" },
  unpaid: { icon: CircleDashed, tone: "border-line bg-tile text-muted" },
  failed: { icon: CircleX, tone: "border-danger/30 bg-danger/10 text-danger" },
  canceled: { icon: Ban, tone: "border-line bg-tile text-muted" },
};

export function StatusChip({ kind, className }: { kind: StatusKind; className?: string }) {
  const t = useTranslations("admin");
  const { icon: Icon, tone } = STYLES[kind];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 border px-2 py-0.5 text-[12px] whitespace-nowrap", tone, className)}
    >
      <Icon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
      {t(`orders.status.${kind}`)}
    </span>
  );
}

/** A small neutral tag marking demo (sample) orders. */
export function SampleTag({ className }: { className?: string }) {
  const t = useTranslations("admin");
  return (
    <span
      className={cn(
        "inline-flex items-center border border-line bg-paper px-1.5 py-0.5 text-[11px] text-muted whitespace-nowrap",
        className,
      )}
    >
      {t("orders.source.sample")}
    </span>
  );
}
