"use client";

import { useMounted } from "@/lib/hooks";
import { useBag } from "@/store/bag";
import { CheckoutFlow } from "./checkout-flow";
import { CheckoutEmpty, CheckoutSkeleton } from "./checkout-states";

/** The saved bag and draft live in localStorage: show a skeleton until they have loaded. */
export function CheckoutView() {
  const mounted = useMounted();
  const hasLines = useBag((s) => s.lines.length > 0);
  if (!mounted) return <CheckoutSkeleton />;
  if (!hasLines) return <CheckoutEmpty />;
  return <CheckoutFlow />;
}
