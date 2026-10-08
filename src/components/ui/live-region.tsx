"use client";

import { useUi } from "@/store/ui";

/**
 * The single permanent polite live region (mounted once in the locale layout).
 * A region inserted together with its message is often not read, so it always exists.
 */
export function LiveRegion() {
  const { text, id } = useUi((s) => s.announcement);
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      <span key={id}>{text}</span>
    </div>
  );
}
