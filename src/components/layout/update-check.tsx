"use client";

import { useEffect } from "react";
import { BASE_PATH } from "@/lib/asset";

const RELOADED_FOR = "ms-reloaded-for";

/**
 * GitHub Pages lets browsers keep a page for up to 10 minutes, and phones often show an
 * open tab without reloading it. On load and whenever the tab comes back into view,
 * this asks /version.json (never cached) which build is live and reloads once if it is
 * newer than the page. Mounted on the shop pages only, so checkout is never interrupted.
 */
export function UpdateCheck() {
  useEffect(() => {
    const current = process.env.NEXT_PUBLIC_BUILD_ID;
    if (!current) return;
    let busy = false;

    const check = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const res = await fetch(`${BASE_PATH}/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const { id } = (await res.json()) as { id?: string };
        if (!id || id === current) return;
        // At most one reload per new version, so a stale cache can never cause a loop.
        if (sessionStorage.getItem(RELOADED_FOR) === id) return;
        sessionStorage.setItem(RELOADED_FOR, id);
        window.location.reload();
      } catch {
        // Offline, blocked storage or a bad response: keep the page as it is.
      } finally {
        busy = false;
      }
    };

    check();
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, []);

  return null;
}
