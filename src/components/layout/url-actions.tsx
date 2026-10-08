"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useBag } from "@/store/bag";
import { useCheckout } from "@/store/checkout";
import { useUi } from "@/store/ui";

export const DEMO_FLAG = "ms-demo";

/**
 * One-shot URL helpers, handled once per page load:
 *  ?code=SAND10  → applies a promo code (influencer / Instagram links)
 *  ?reset=1      → clears bag, checkout draft and local orders (presenter reset)
 *  ?demo=1 / 0   → shows / hides the presenter tools for this browser session
 */
export function UrlActions() {
  const t = useTranslations("common");
  const applyPromo = useBag((s) => s.applyPromo);
  const pushToast = useUi((s) => s.pushToast);

  useEffect(() => {
    const url = new URL(window.location.href);
    let changed = false;

    const code = url.searchParams.get("code");
    if (code) {
      const result = applyPromo(code, new Date());
      const promo = useBag.getState().promo;
      pushToast({
        title:
          result === "applied" && promo
            ? t("promo.applied", { code: promo.code, percent: promo.percent })
            : t(`promo.${result}`),
      });
      url.searchParams.delete("code");
      changed = true;
    }

    if (url.searchParams.get("reset") === "1") {
      useBag.getState().clear();
      useCheckout.getState().resetAll();
      pushToast({ title: t("demo.resetDone") });
      url.searchParams.delete("reset");
      changed = true;
    }

    const demo = url.searchParams.get("demo");
    if (demo === "1" || demo === "0") {
      try {
        if (demo === "1") sessionStorage.setItem(DEMO_FLAG, "1");
        else sessionStorage.removeItem(DEMO_FLAG);
      } catch {
        // storage blocked
      }
      window.dispatchEvent(new Event("ms:demo-changed"));
      url.searchParams.delete("demo");
      changed = true;
    }

    if (changed) window.history.replaceState(window.history.state, "", url.toString());
    // Run once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
