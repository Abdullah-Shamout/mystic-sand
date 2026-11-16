"use client";

import { Direction } from "radix-ui";
import { BagDrawer } from "@/components/cart/bag-drawer";
import { LiveRegion } from "@/components/ui/live-region";
import { Toaster } from "@/components/ui/toaster";
import { LiveProvider, type LiveData } from "@/lib/live";
import { DemoHelpers } from "./demo-helpers";
import { SearchOverlay } from "./search-overlay";
import { SiteMenu } from "./site-menu";
import { StorageSync } from "./storage-sync";
import { UrlActions } from "./url-actions";

/**
 * Client-side globals mounted once per locale: the live-data provider (catalog / settings / home,
 * read from the DB by the locale layout), direction, overlays, toasts, live region.
 */
export function Providers({
  dir,
  live,
  children,
}: {
  dir: "ltr" | "rtl";
  live: LiveData;
  children: React.ReactNode;
}) {
  return (
    <Direction.Provider dir={dir}>
      <LiveProvider value={live}>
        {children}
        <BagDrawer />
        <SearchOverlay />
        <SiteMenu />
        <Toaster />
        <LiveRegion />
        <UrlActions />
        <StorageSync />
        <DemoHelpers />
      </LiveProvider>
    </Direction.Provider>
  );
}
