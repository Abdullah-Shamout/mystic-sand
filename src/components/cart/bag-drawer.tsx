"use client";

import { useTranslations } from "next-intl";
import { Drawer } from "@/components/ui/drawer";
import { useMounted } from "@/lib/hooks";
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
  const hasLines = useBag((s) => s.lines.length > 0);
  const close = () => setOpen(false);

  return (
    <Drawer
      open={open}
      onOpenChange={setOpen}
      title={mounted && count > 0 ? t("titleWithCount", { count }) : t("title")}
      footer={mounted && hasLines ? <BagSummary onNavigate={close} compact /> : undefined}
    >
      <BagView onNavigate={close} />
    </Drawer>
  );
}
