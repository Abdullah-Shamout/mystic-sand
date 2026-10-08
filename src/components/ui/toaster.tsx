"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useUi, type Toast } from "@/store/ui";
import { ResponsiveImage } from "./responsive-image";

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useUi((s) => s.dismissToast);
  const t = useTranslations("common");

  useEffect(() => {
    const id = setTimeout(() => dismiss(toast.id), toast.duration ?? 5000);
    return () => clearTimeout(id);
  }, [toast.id, toast.duration, dismiss]);

  return (
    <div className="pointer-events-auto flex w-full animate-toast-in items-start gap-3 border border-line bg-paper p-3 text-ink">
      {toast.image && (
        <div className="relative size-16 shrink-0 bg-tile">
          <ResponsiveImage image={toast.image} alt="" sizes="64px" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div>
          <p className="text-[14px] font-medium leading-snug">{toast.title}</p>
          {toast.description && <p className="text-[13px] leading-snug text-muted">{toast.description}</p>}
        </div>
        {toast.actions && (
          <div className="flex flex-wrap gap-2">
            {toast.actions.map((a) => {
              const cls = cn(
                "caps inline-flex h-9 items-center px-3 text-[12px] transition-colors",
                a.primary ? "bg-racing text-cream hover:bg-racing-deep" : "border border-ink hover:bg-ink hover:text-paper",
              );
              return a.href ? (
                <Link key={a.label} href={a.href} className={cls} onClick={() => dismiss(toast.id)}>
                  {a.label}
                </Link>
              ) : (
                <button
                  key={a.label}
                  type="button"
                  className={cls}
                  onClick={() => {
                    a.onClick?.();
                    dismiss(toast.id);
                  }}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        className="-m-1 inline-flex size-9 shrink-0 items-center justify-center opacity-60 hover:opacity-100"
        aria-label={t("close")}
      >
        <X className="size-4" strokeWidth={1.25} />
      </button>
    </div>
  );
}

/** Non-blocking confirmations (quick add, undo). Bottom on mobile, under the header on desktop. */
export function Toaster() {
  const toasts = useUi((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col gap-2 p-3 md:inset-x-auto md:end-6 md:top-[150px] md:bottom-auto md:w-[380px] md:p-0">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
