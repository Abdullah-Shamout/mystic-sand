import type { Product } from "@/data/types";
import { baseCatalog, buildCatalog, type Catalog, type CatalogEdits } from "@/lib/catalog";
import { useMounted } from "@/lib/hooks";
import { defaultSettings, resolveSettings, type StoreSettings } from "@/lib/settings";
import { useCatalogStore } from "@/store/catalog";
import { useSettingsStore } from "@/store/settings";

/**
 * The live catalog and settings — base/default values the storefront reads at runtime, plus
 * the admin's edits once they are in localStorage.
 *
 * Hydration rules (zustand rehydrates synchronously, but the server and the first client
 * render must still match):
 *  - During render, read ONLY through the hooks (useLiveCatalog / useLiveProduct /
 *    useLiveSettings). They return the base/default values until useMounted() is true, so the
 *    static HTML and the hydration pass agree; after mount they switch to the live values.
 *  - getLiveCatalog() / getLiveSettings() are for event handlers, effects, store actions and
 *    code that is already gated on mount — never during render. On the server they return the
 *    base/default values; on the client they build from the current store state.
 *
 * Results are memoised by the identity of the edits / overrides object, so repeated calls in
 * one render or one handler return the same catalog instance.
 */

let catalogCache: { edits: CatalogEdits; catalog: Catalog } | null = null;
function catalogFor(edits: CatalogEdits): Catalog {
  if (!catalogCache || catalogCache.edits !== edits) {
    catalogCache = { edits, catalog: buildCatalog(edits) };
  }
  return catalogCache.catalog;
}

let settingsCache: { overrides: Partial<StoreSettings>; settings: StoreSettings } | null = null;
function settingsFor(overrides: Partial<StoreSettings>): StoreSettings {
  if (!settingsCache || settingsCache.overrides !== overrides) {
    settingsCache = { overrides, settings: resolveSettings(overrides) };
  }
  return settingsCache.settings;
}

/** Event-handler / effect getter. Base catalog on the server, live catalog on the client. */
export function getLiveCatalog(): Catalog {
  if (typeof window === "undefined") return baseCatalog;
  return catalogFor(useCatalogStore.getState().edits);
}

/** Event-handler / effect getter. Default settings on the server, live settings on the client. */
export function getLiveSettings(): StoreSettings {
  if (typeof window === "undefined") return defaultSettings;
  return settingsFor(useSettingsStore.getState().overrides);
}

/** Render-safe catalog hook: base until mounted, then live. */
export function useLiveCatalog(): Catalog {
  const edits = useCatalogStore((s) => s.edits);
  const mounted = useMounted();
  return mounted ? catalogFor(edits) : baseCatalog;
}

/** Render-safe product hook (may be hidden; callers decide what to do with that). */
export function useLiveProduct(slug: string): Product | undefined {
  return useLiveCatalog().bySlug.get(slug);
}

/** Render-safe settings hook: defaults until mounted, then live. */
export function useLiveSettings(): StoreSettings {
  const overrides = useSettingsStore((s) => s.overrides);
  const mounted = useMounted();
  return mounted ? settingsFor(overrides) : defaultSettings;
}
