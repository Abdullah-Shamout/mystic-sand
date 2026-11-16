// Time-based revalidation window (seconds) for the tag-cached storefront reads.
//
// Phase 2b has no write path that calls revalidateTag yet, so the ONLY thing that refreshes the
// storefront after a DB change is this time-based window. It is deliberately short so a fresh page
// load reflects a DB change (invariant 2) without any invalidation trigger. The tags
// (catalog/settings/home) are already in place; Phase 3 wires revalidateTag onto the admin write
// actions and should lengthen this (minutes, or `false` to cache until revalidateTag).
//
// Must be `false` or a positive number — unstable_cache throws on `revalidate: 0`.
export const STOREFRONT_REVALIDATE = 1;
