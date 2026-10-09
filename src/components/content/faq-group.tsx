"use client";

import { useSyncExternalStore } from "react";
import { Accordion, type AccordionItem } from "@/components/ui/accordion";

const subscribe = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

/**
 * One FAQ topic. Arriving on /faq#payment (footer "Payment methods") opens the
 * first question of that topic; the section itself carries the anchor id.
 */
export function FaqGroup({ id, items }: { id: string; items: AccordionItem[] }) {
  const targeted = useSyncExternalStore(
    subscribe,
    () => window.location.hash === `#${id}`,
    () => false,
  );
  return (
    <Accordion
      key={targeted ? "targeted" : "idle"}
      items={items}
      defaultOpen={targeted && items[0] ? [items[0].id] : undefined}
    />
  );
}
