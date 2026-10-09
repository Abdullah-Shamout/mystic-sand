"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { Price } from "@/components/ui/price";

/** Shown for under a second before handing over to KNET's (simulated) hosted page. */
export function RedirectOverlay({ method, amountFils, durationMs }: { method: "knet" | "card"; amountFils: number; durationMs: number }) {
  const t = useTranslations("checkout.redirect");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setStarted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-paper px-6 text-center" data-testid="redirect-overlay">
      <div aria-hidden>
        <Logo variant="mark" className="h-16 w-auto text-ink" title="" />
      </div>
      <p className="mt-8 max-w-sm font-serif text-[24px] leading-snug font-medium">
        {method === "knet" ? t("knet") : t("card")}
      </p>
      <p className="mt-6 text-[13px] text-muted">{t("amount")}</p>
      <Price fils={amountFils} className="text-[22px] font-medium" />
      <div className="mt-8 h-px w-48 overflow-hidden bg-line">
        <div
          className="h-full origin-left bg-racing ease-linear rtl:origin-right"
          style={{ transform: `scaleX(${started ? 1 : 0})`, transitionProperty: "transform", transitionDuration: `${durationMs}ms` }}
        />
      </div>
      <p className="mt-6 inline-flex items-center gap-1.5 text-[13px] text-muted">
        <Lock className="size-3.5" strokeWidth={1.5} aria-hidden />
        {t("dontClose")}
      </p>
    </div>
  );
}
