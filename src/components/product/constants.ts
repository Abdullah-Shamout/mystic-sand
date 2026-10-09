// Shared by server and client modules (a "use client" file cannot export plain values
// to Server Components).

/** Marks the end of the product page content; the mobile buy bar hides from here on. */
export const PDP_END_ID = "pdp-end";

/** Desktop header height (utility row + nav row + hairline) plus breathing room. */
export const STICKY_TOP_PX = 137 + 24;

/** First-strong isolate, for Latin names inside Arabic aria-labels, titles and WhatsApp text. */
export const isolate = (text: string) => `⁨${text}⁩`;
