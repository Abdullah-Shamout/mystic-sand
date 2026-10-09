"use client";

import { useTranslations } from "next-intl";
import { Drawer } from "@/components/ui/drawer";
import { useMounted } from "@/lib/hooks";
import { priceLines } from "@/lib/pricing";
import { useBag, useBagCount } from "@/store/bag";
import { useUi } from "@/store/ui";
import { BagSummary, BagView } from "./bag-view";

/** Global bag drawer (Amouage: 520px, from the right — from the left in Arabic). */
export function BagDrawer() {
  const t = useTranslations("cart");
  const open = useUi((s) => s.bagOpen);
  const setOpen = useUi((s) => s.setBagOpen);
  const mounted = useMounted();
  const count = useBagCount();
  // Only lines that can still be bought count: no totals for a bag of unavailable items.
  const hasItems = useBag((s) => priceLines(s.lines).priced.length > 0);
  const close = () => setOpen(false);

  return (
    <Drawer
      open={open}
      onOpenChange={setOpen}
      title={mounted && count > 0 ? t("titleWithCount", { count }) : t("title")}
      footer={mounted && hasItems ? <BagSummary onNavigate={close} compact /> : undefined}
    >
      <BagView onNavigate={close} />
    </Drawer>
  );
}
