"use client";

import { useEffect, useEffectEvent, useState } from "react";

/**
 * Whole seconds left until `deadline` (epoch ms). Ticks only after mount, so the
 * static HTML never contains a time. Returns null without a deadline or before
 * the first tick. `onExpire` fires once when the count reaches zero.
 */
export function useCountdown(deadline: number | null, onExpire?: () => void): number | null {
  const [state, setState] = useState<{ deadline: number; left: number } | null>(null);
  const expire = useEffectEvent(() => onExpire?.());

  useEffect(() => {
    if (deadline == null) return;
    let fired = false;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setState((prev) => (prev?.deadline === deadline && prev.left === left ? prev : { deadline, left }));
      if (left === 0 && !fired) {
        fired = true;
        clearInterval(interval);
        expire();
      }
    };
    const first = setTimeout(tick, 0);
    // Sub-second polling keeps the display honest after the tab was throttled in the background.
    const interval = setInterval(tick, 250);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [deadline]);

  return deadline != null && state?.deadline === deadline ? state.left : null;
}
