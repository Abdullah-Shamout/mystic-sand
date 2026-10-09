"use client";

import { useCallback, useEffect, useRef } from "react";

/** A single pending timeout (step transitions, processing), cleared on unmount. */
export function useTimeout() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const start = useCallback(
    (fn: () => void, ms: number) => {
      stop();
      timer.current = setTimeout(() => {
        timer.current = null;
        fn();
      }, ms);
    },
    [stop],
  );

  useEffect(() => stop, [stop]);

  return { start, stop };
}
