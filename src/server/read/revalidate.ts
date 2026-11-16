// Time-based revalidation windows (seconds) for the tag-cached storefront reads.
//
// CATALOG still has no updateTag write path (Phase 3c adds it), so this short window is the ONLY
// thing that refreshes it after a DB change — e.g. live-db.spec changes a price with raw SQL and
// expects a fresh load to reflect it within ~1s. Keep it short until Phase 3c wires the catalog tag,
// then it can lengthen.
//
// Must be `false` or a positive number — unstable_cache throws on `revalidate: 0`.
export const STOREFRONT_REVALIDATE = 1;

// SETTINGS now has a write path that calls updateTag("settings") (saveSettings) — immediate expiry —
// so freshness comes from the tag, not this window; this is only a backstop against a missed
// invalidation. 300s per the Phase 3a plan.
export const SETTINGS_REVALIDATE = 300;

// HOME now has a write path that calls updateTag("home") (saveHomeSection / resetAllHome) — immediate
// expiry — so freshness comes from the tag, not this window; this is only a backstop against a missed
// invalidation. 300s, mirroring SETTINGS_REVALIDATE.
export const HOME_REVALIDATE = 300;
