"use client";

import { Direction } from "radix-ui";
import { BagDrawer } from "@/components/cart/bag-drawer";
import { LiveRegion } from "@/components/ui/live-region";
import { Toaster } from "@/components/ui/toaster";
import { DemoHelpers } from "./demo-helpers";
import { MobileMenu } from "./mobile-menu";
import { SearchOverlay } from "./search-overlay";
import { UrlActions } from "./url-actions";

/** Client-side globals mounted once per locale: direction, overlays, toasts, live region. */
export function Providers({ dir, children }: { dir: "ltr" | "rtl"; children: React.ReactNode }) {
  return (
    <Direction.Provider dir={dir}>
      {children}
      <BagDrawer />
      <SearchOverlay />
      <MobileMenu />
      <Toaster />
      <LiveRegion />
      <UrlActions />
      <DemoHelpers />
    </Direction.Provider>
  );
}
