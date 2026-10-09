"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog, VisuallyHidden } from "radix-ui";
import { cn } from "@/lib/cn";

/** Centered dialog on desktop, bottom sheet on mobile (Apple Pay sheet, size picker, lightbox). */
export function Modal({
  open,
  onOpenChange,
  title,
  hideTitle = false,
  children,
  className,
  closeLabel,
  dark = false,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  hideTitle?: boolean;
  children: React.ReactNode;
  className?: string;
  closeLabel?: string;
  dark?: boolean;
  /** Where focus goes on close (default: back to the element that opened it). */
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const t = useTranslations("common");
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/55 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={onCloseAutoFocus}
          className={cn(
            "fixed z-50 outline-none",
            "inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in",
            "sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[86dvh] sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:data-[state=closed]:animate-fade-out sm:data-[state=open]:animate-fade-in",
            dark ? "bg-ink text-paper" : "bg-paper text-ink",
            "safe-bottom",
            className,
          )}
        >
          {hideTitle ? (
            <VisuallyHidden.Root>
              <Dialog.Title>{title}</Dialog.Title>
            </VisuallyHidden.Root>
          ) : (
            <Dialog.Title className="caps px-6 pt-6 text-[15px] font-medium">{title}</Dialog.Title>
          )}
          <Dialog.Close
            className="absolute end-3 top-3 inline-flex size-11 items-center justify-center opacity-80 transition-opacity hover:opacity-100"
            aria-label={closeLabel ?? t("close")}
          >
            <X className="size-5" strokeWidth={1.25} />
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
