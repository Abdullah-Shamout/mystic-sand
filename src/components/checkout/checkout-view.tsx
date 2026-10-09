"use client";

import { useMounted } from "@/lib/hooks";
import { useLiveCatalog } from "@/lib/live";
import { priceLines } from "@/lib/pricing";
import { useBag } from "@/store/bag";
import { CheckoutFlow } from "./checkout-flow";
import { CheckoutEmpty, CheckoutSkeleton } from "./checkout-states";

/**
 * The saved bag and draft live in localStorage: show a skeleton until they have loaded.
 * A bag holding only products that are no longer sold counts as empty here.
 */
export function CheckoutView() {
  const mounted = useMounted();
  const catalog = useLiveCatalog();
  const hasItems = useBag((s) => priceLines(s.lines, catalog).priced.length > 0);
  if (!mounted) return <CheckoutSkeleton />;
  if (!hasItems) return <CheckoutEmpty />;
  return <CheckoutFlow />;
}
