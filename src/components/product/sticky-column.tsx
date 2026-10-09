"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { STICKY_TOP_PX } from "./constants";

const GAP = 24;

/**
 * Desktop info column that stays beside the image stack. A column taller than the
 * window (accordions open) scrolls with the page until its last line is in view and
 * sticks there; scrolling back up brings its top — and the buy buttons — back first.
 */
export function StickyColumn({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    let top = STICKY_TOP_PX;
    let lastY = window.scrollY;

    const update = () => {
      const y = window.scrollY;
      const delta = y - lastY;
      lastY = y;
      if (!desktop.matches) {
        el.style.top = "";
        return;
      }
      // Lowest offset that still shows the column's end; equals the header offset when it fits.
      const min = Math.min(STICKY_TOP_PX, window.innerHeight - el.offsetHeight - GAP);
      top = Math.max(min, Math.min(STICKY_TOP_PX, top - delta));
      el.style.top = `${top}px`;
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    desktop.addEventListener("change", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      desktop.removeEventListener("change", update);
    };
  }, []);

  return (
    <div ref={ref} className={cn("lg:sticky lg:top-[113px] lg:self-start", className)}>
      {children}
    </div>
  );
}
