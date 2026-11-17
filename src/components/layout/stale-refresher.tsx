"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "@/i18n/navigation";

// Refreshes the current route's Server Components when the tab is brought back to the foreground, so
// an already-open storefront / checkout tab picks up an admin edit (a price, catalog or home change
// that revalidated the cached read) when the shopper returns to it. router.refresh() merges the new
// RSC payload without touching client state (bag draft, scroll).
//
// Mounted ONLY on the shop + checkout layouts — never in providers.tsx / the shared [locale] layout
// (which also wraps the admin), so it can't refresh an admin out from under a mid-edit. A cooldown
// guards against a rapid flicker (an OS notification, a quick alt-tab) refreshing repeatedly.

const COOLDOWN_MS = 10_000;

export function StaleRefresher() {
  const router = useRouter();
  const lastRefresh = useRef(0);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRefresh.current < COOLDOWN_MS) return;
      lastRefresh.current = now;
      router.refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [router]);

  return null;
}
