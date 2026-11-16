"use client";

import { createContext, useContext, useMemo } from "react";

import type { Category } from "@/data/categories";
import type { Product } from "@/data/types";
import { baseCatalog, indexCatalog, type Catalog } from "@/lib/catalog";
import { EMPTY_HOME, type HomeOverrides } from "@/lib/home";
import { getLiveSnapshot, setLiveSnapshot } from "@/lib/live-snapshot";
import { defaultSettings, type StoreSettings } from "@/lib/settings";

/**
 * The live catalog, settings and home overrides — read from the Postgres DB on the server
 * (src/server/read/*) and handed to <LiveProvider> by the locale layout. The storefront reads them
 * through the hooks below, whose signatures and return types are unchanged, so the ~46 consumers
 * don't change.
 *
 * The server supplies real data, so the server HTML and the first client render already agree:
 * there is no mounted-gate / hydration swap here anymore (that remains in useMounted for the
 * genuinely client-only stores — bag, checkout draft). For event handlers / store actions that
 * can't call hooks, the non-hook getters read a client snapshot that <LiveProvider> publishes.
 */

/** Plain, serializable catalog data as it crosses the server→client boundary (no Maps). */
export type LiveCatalogData = { products: Product[]; categories: Category[] };
export type LiveData = { catalog: LiveCatalogData; settings: StoreSettings; home: HomeOverrides };

type LiveContextValue = { catalog: Catalog; settings: StoreSettings; home: HomeOverrides };

// Default = the seed/defaults, so a hook used (wrongly) outside the provider still renders sanely.
const DEFAULT_CONTEXT: LiveContextValue = {
  catalog: baseCatalog,
  settings: defaultSettings,
  home: EMPTY_HOME,
};

const LiveContext = createContext<LiveContextValue>(DEFAULT_CONTEXT);

/** Provides the server-read live data to the storefront. Mounted once per locale in providers.tsx. */
export function LiveProvider({ value, children }: { value: LiveData; children: React.ReactNode }) {
  // Build the indexed Catalog (bySlug/bySku/visible) on the client from the plain data. Memoised by
  // the identity of the server-sent catalog object, which is stable until the next RSC payload.
  const catalog = useMemo(
    () => indexCatalog(value.catalog.products, value.catalog.categories),
    [value.catalog],
  );

  const ctx = useMemo<LiveContextValue>(
    () => ({ catalog, settings: value.settings, home: value.home }),
    [catalog, value.settings, value.home],
  );

  // Publish to the non-hook getters. Client-only (the module snapshot must never be shared across
  // SSR requests) and idempotent. Written during render, not in an effect: a child's mount effect
  // runs before the provider's effect, and some handlers read the snapshot early.
  if (typeof window !== "undefined") setLiveSnapshot(ctx);

  return <LiveContext.Provider value={ctx}>{children}</LiveContext.Provider>;
}

// --- render-safe hooks ----------------------------------------------------------------

/** Render-safe catalog hook. */
export function useLiveCatalog(): Catalog {
  return useContext(LiveContext).catalog;
}

/** Render-safe product hook (may be hidden; callers decide what to do with that). */
export function useLiveProduct(slug: string): Product | undefined {
  return useLiveCatalog().bySlug.get(slug);
}

/** Render-safe settings hook. */
export function useLiveSettings(): StoreSettings {
  return useContext(LiveContext).settings;
}

/** Render-safe home-override hook. */
export function useLiveHome(): HomeOverrides {
  return useContext(LiveContext).home;
}

// --- non-hook getters (event handlers / effects / store actions) ----------------------

/** Event-handler / effect getter. Reads the client snapshot <LiveProvider> publishes. */
export function getLiveCatalog(): Catalog {
  return getLiveSnapshot().catalog;
}

/** Event-handler / effect getter. Reads the client snapshot <LiveProvider> publishes. */
export function getLiveSettings(): StoreSettings {
  return getLiveSnapshot().settings;
}
