"use client";

import { useTranslations } from "next-intl";
import { useAdminStore } from "@/store/admin";
import { useUi } from "@/store/ui";

/**
 * Mark-done / mark-pending with an undo toast. "now" is read inside the handlers (never during
 * render). Shared by the table, the phone cards and the order drawer.
 */
export function useFulfillment() {
  const t = useTranslations("admin");
  const pushToast = useUi((s) => s.pushToast);
  const markDone = useAdminStore((s) => s.markDone);
  const markPending = useAdminStore((s) => s.markPending);

  return {
    markDone: (id: string) => {
      markDone([id], new Date().toISOString());
      pushToast({
        title: t("orders.markedDone", { id }),
        actions: [{ label: t("orders.undo"), onClick: () => markPending([id]) }],
      });
    },
    markPending: (id: string) => {
      markPending([id]);
      pushToast({
        title: t("orders.markedPending", { id }),
        actions: [{ label: t("orders.undo"), onClick: () => markDone([id], new Date().toISOString()) }],
      });
    },
  };
}
