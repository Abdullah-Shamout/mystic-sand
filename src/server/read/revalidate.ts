// Time-based revalidation windows (seconds) for the tag-cached storefront reads.
//
// CATALOG now has a write path that calls updateTag("catalog") (the admin Server Actions in
// src/server/actions/catalog.ts) — immediate expiry — so freshness comes from the tag, not this
// window; this is only a backstop against a missed invalidation. 300s, mirroring SETTINGS/HOME.
//
// Must be `false` or a positive number — unstable_cache throws on `revalidate: 0`.
export const CATALOG_REVALIDATE = 300;

// SETTINGS now has a write path that calls updateTag("settings") (saveSettings) — immediate expiry —
// so freshness comes from the tag, not this window; this is only a backstop against a missed
// invalidation. 300s per the Phase 3a plan.
export const SETTINGS_REVALIDATE = 300;

// HOME now has a write path that calls updateTag("home") (saveHomeSection / resetAllHome) — immediate
// expiry — so freshness comes from the tag, not this window; this is only a backstop against a missed
// invalidation. 300s, mirroring SETTINGS_REVALIDATE.
export const HOME_REVALIDATE = 300;
