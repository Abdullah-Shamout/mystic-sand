"use client";

import { Direction } from "radix-ui";
import { BagDrawer } from "@/components/cart/bag-drawer";
import { LiveRegion } from "@/components/ui/live-region";
import { Toaster } from "@/components/ui/toaster";
import { DemoHelpers } from "./demo-helpers";
import { SearchOverlay } from "./search-overlay";
import { SiteMenu } from "./site-menu";
import { StorageSync } from "./storage-sync";
import { UrlActions } from "./url-actions";

/** Client-side globals mounted once per locale: direction, overlays, toasts, live region. */
export function Providers({ dir, children }: { dir: "ltr" | "rtl"; children: React.ReactNode }) {
  return (
    <Direction.Provider dir={dir}>
      {children}
      <BagDrawer />
      <SearchOverlay />
      <SiteMenu />
      <Toaster />
      <LiveRegion />
      <UrlActions />
      <StorageSync />
      <DemoHelpers />
    </Direction.Provider>
  );
}
