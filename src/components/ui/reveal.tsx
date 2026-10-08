"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Amouage-style scroll reveal: fade up over 0.6s, staggered 75ms by `index`.
 * Content is visible in the static HTML; only elements that start below the fold
 * are hidden (after hydration) and revealed on scroll — so nothing stays invisible
 * if JavaScript fails, and nothing above the fold flickers.
 */
export function Reveal({
  as: Tag = "div",
  index = 0,
  className,
  children,
}: {
  as?: "div" | "section" | "li" | "article";
  index?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    el.dataset.state = "hidden";
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.dataset.state = "shown";
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag ref={ref as never} className={cn("reveal", className)} style={{ "--reveal-index": index } as React.CSSProperties}>
      {children}
    </Tag>
  );
}
