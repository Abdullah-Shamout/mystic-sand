"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog, VisuallyHidden } from "radix-ui";
import { cn } from "@/lib/cn";

/**
 * Side sheet (bag, mobile menu, filters). Opens from the end side by default —
 * the right in English, the left in Arabic. Radix handles the focus trap and
 * returns focus to the trigger on close.
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  hideTitle = false,
  side = "end",
  width = "max-w-[520px]",
  header,
  footer,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  hideTitle?: boolean;
  side?: "start" | "end";
  width?: string;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const t = useTranslations("common");
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/50 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            "fixed inset-y-0 z-50 flex h-dvh w-full flex-col bg-paper text-ink shadow-none outline-none",
            "data-[state=closed]:animate-drawer-out data-[state=open]:animate-drawer-in",
            side === "end" ? "inset-e-0 drawer-from-end" : "inset-s-0 drawer-from-start",
            width,
            className,
          )}
        >
          <div className="flex min-h-16 items-center justify-between gap-4 border-b border-line px-6">
            {hideTitle ? (
              <VisuallyHidden.Root>
                <Dialog.Title>{title}</Dialog.Title>
              </VisuallyHidden.Root>
            ) : (
              <Dialog.Title className="caps text-[15px] font-medium">{title}</Dialog.Title>
            )}
            {header}
            <Dialog.Close
              className="-me-2 inline-flex size-11 items-center justify-center text-ink transition-opacity hover:opacity-60"
              aria-label={t("close")}
            >
              <X className="size-5" strokeWidth={1.25} />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
          {footer && <div className="safe-bottom border-t border-line bg-paper">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
