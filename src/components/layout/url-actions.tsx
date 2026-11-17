"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useBag } from "@/store/bag";
import { useUi } from "@/store/ui";

/**
 * One-shot URL helper, handled once per page load:
 *  ?code=SAND10  → applies a promo code (influencer / Instagram links), then strips it from the URL.
 */
export function UrlActions() {
  const t = useTranslations("common");
  const applyPromo = useBag((s) => s.applyPromo);
  const pushToast = useUi((s) => s.pushToast);

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    if (!code) return;

    const result = applyPromo(code, new Date());
    const promo = useBag.getState().promo;
    pushToast({
      title:
        result === "applied" && promo
          ? t("promo.applied", { code: promo.code, percent: promo.percent })
          : t(`promo.${result}`),
    });
    url.searchParams.delete("code");
    window.history.replaceState(window.history.state, "", url.toString());
    // Run once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
