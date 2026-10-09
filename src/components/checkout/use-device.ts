"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** Instagram's in-app browser (where most visitors arrive from) has no Apple Pay. */
export function useInstagramBrowser(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => navigator.userAgent.includes("Instagram"),
    () => false,
  );
}

const TEXT_INPUTS = new Set(["text", "tel", "email", "url", "search", "number", "password"]);

export const isTextField = (el: Element | null): el is HTMLInputElement | HTMLTextAreaElement =>
  el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && TEXT_INPUTS.has(el.type));

/**
 * True while the on-screen keyboard is (probably) open: the visual viewport shrinks on iOS
 * and Chrome; a focused text field on a touch screen covers browsers that resize the page.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    const coarse = window.matchMedia("(pointer: coarse)");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      const shrunk = vv ? window.innerHeight - vv.height * vv.scale > 120 : false;
      setOpen(shrunk || (coarse.matches && isTextField(document.activeElement)));
    };
    // Focus moves through <body> between two fields; wait for it to settle.
    const settle = () => {
      clearTimeout(timer);
      timer = setTimeout(update, 60);
    };
    vv?.addEventListener("resize", update);
    document.addEventListener("focusin", settle);
    document.addEventListener("focusout", settle);
    return () => {
      clearTimeout(timer);
      vv?.removeEventListener("resize", update);
      document.removeEventListener("focusin", settle);
      document.removeEventListener("focusout", settle);
    };
  }, []);
  return open;
}
