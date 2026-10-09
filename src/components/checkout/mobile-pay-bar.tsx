"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { cn } from "@/lib/cn";
import { FORM_ID, PAY_BUTTON_ID } from "./form-helpers";
import { useCheckoutTotals } from "./order-summary";
import { useKeyboardOpen } from "./use-device";

/**
 * Phones: total + Pay pinned to the bottom (above the home indicator). It steps aside while
 * the keyboard is open and while the main Pay button is on screen.
 */
export function MobilePayBar({ busy }: { busy: boolean }) {
  const t = useTranslations("checkout");
  const tc = useTranslations("cart");
  const { totals } = useCheckoutTotals();
  const keyboardOpen = useKeyboardOpen();
  const [payInView, setPayInView] = useState(false);

  useEffect(() => {
    const el = document.getElementById(PAY_BUTTON_ID);
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setPayInView(entry.isIntersecting), { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const hidden = keyboardOpen || payInView;

  return (
    <div
      inert={hidden}
      className={cn(
        "safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper transition-transform duration-300 ease-[var(--ease-soft)] lg:hidden",
        hidden && "translate-y-full",
      )}
    >
      <div className="flex items-center gap-4 px-4 py-3 md:px-6">
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-[12px] text-muted">{tc("total")}</p>
          <Price fils={totals.totalFils} className="text-[17px] font-medium" />
        </div>
        <Button type="submit" form={FORM_ID} busy={busy} className="min-w-[46%]">
          {t("payment.pay")}
        </Button>
      </div>
    </div>
  );
}
