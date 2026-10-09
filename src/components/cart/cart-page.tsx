"use client";

import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { useMounted } from "@/lib/hooks";
import { priceLines } from "@/lib/pricing";
import { useBag } from "@/store/bag";
import { BagExtras, BagSummary, BagView } from "./bag-view";

/** /cart: the drawer's content as a page — lines on the left, a sticky summary on the right. */
export function CartPage() {
  const t = useTranslations("cart");
  const mounted = useMounted();
  // Only lines that can still be bought count: no summary for a bag of unavailable items.
  const hasItems = useBag((s) => priceLines(s.lines).priced.length > 0);

  if (!mounted) {
    return (
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12" aria-busy>
        <Skeleton className="h-[360px] w-full" />
        <Skeleton className="mt-6 hidden h-[360px] w-full lg:mt-0 lg:block" />
      </div>
    );
  }

  if (!hasItems) return <BagView variant="page" />;

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-12 xl:grid-cols-[minmax(0,1fr)_440px]">
      <BagView variant="page" />
      <aside aria-labelledby="cart-summary-title" className="mt-8 border border-line lg:sticky lg:top-[113px] lg:mt-0">
        <h2 id="cart-summary-title" className="caps border-b border-line px-6 py-5 font-serif text-[22px] font-medium">
          {t("summaryTitle")}
        </h2>
        <BagSummary />
        <div className="border-t border-line">
          <BagExtras />
        </div>
      </aside>
    </div>
  );
}
