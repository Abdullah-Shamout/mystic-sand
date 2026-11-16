import { baseCatalog, type Catalog } from "@/lib/catalog";
import { EMPTY_HOME, type HomeOverrides } from "@/lib/home";
import { defaultSettings, type StoreSettings } from "@/lib/settings";

// A small client-side snapshot of the live data. <LiveProvider> writes it on every (client) render
// so the non-hook getters — getLiveCatalog() / getLiveSettings() / getLiveAvailable() — can read the
// current live values from event handlers and store actions, where hooks can't run.
//
// This module is pure (no React, no "use client"): it is only ever WRITTEN on the client, so the
// server never shares mutable state across requests. The defaults mirror the seed, so a getter
// called before the first client render still returns sane values.

export type LiveSnapshot = { catalog: Catalog; settings: StoreSettings; home: HomeOverrides };

let current: LiveSnapshot = {
  catalog: baseCatalog,
  settings: defaultSettings,
  home: EMPTY_HOME,
};

/** Called by <LiveProvider> (client only) to publish the current live data to the getters. */
export function setLiveSnapshot(next: LiveSnapshot): void {
  current = next;
}

export function getLiveSnapshot(): LiveSnapshot {
  return current;
}
