"use client";

import { useEffect, useRef } from "react";

/** Moves focus to the returned element once mounted (page and step headings, tabIndex=-1). */
export function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return ref;
}
