"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";

/**
 * A small yes/no confirmation built on the shared Modal — used before a reset or a delete in
 * the products admin. The confirm button turns red when `danger` is set.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}) {
  const tc = useTranslations("common");
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} className="sm:max-w-md">
      <div className="space-y-6 px-6 pt-4 pb-6">
        <p className="text-[14px] leading-relaxed text-ink">{message}</p>
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            {cancelLabel ?? tc("close")}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
            className={cn(danger && "border-danger bg-danger text-paper hover:border-danger/85 hover:bg-danger/85")}
            data-testid="confirm-accept"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
