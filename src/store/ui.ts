"use client";

import { create } from "zustand";

export type Toast = {
  id: number;
  title: string;
  description?: string;
  /** Image key (src/data/media.generated.json) for "added to bag" toasts. */
  image?: string;
  actions?: Array<{ label: string; href?: string; onClick?: () => void; primary?: boolean }>;
  duration?: number;
};

type UiState = {
  bagOpen: boolean;
  searchOpen: boolean;
  menuOpen: boolean;
  toasts: Toast[];
  announcement: { text: string; id: number };
  openBag: () => void;
  setBagOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  setMenuOpen: (open: boolean) => void;
  pushToast: (toast: Omit<Toast, "id">) => number;
  dismissToast: (id: number) => void;
  /** Speaks through the single permanent aria-live region. */
  announce: (text: string) => void;
};

let toastSeq = 0;

export const useUi = create<UiState>()((set, get) => ({
  bagOpen: false,
  searchOpen: false,
  menuOpen: false,
  toasts: [],
  announcement: { text: "", id: 0 },
  openBag: () => set({ bagOpen: true, searchOpen: false, menuOpen: false }),
  setBagOpen: (bagOpen) => set({ bagOpen }),
  setSearchOpen: (searchOpen) => set({ searchOpen, menuOpen: false }),
  setMenuOpen: (menuOpen) => set({ menuOpen }),
  pushToast: (toast) => {
    const id = ++toastSeq;
    // Keep at most two on screen.
    set({ toasts: [...get().toasts.slice(-1), { ...toast, id }] });
    return id;
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  announce: (text) => set({ announcement: { text, id: get().announcement.id + 1 } }),
}));
