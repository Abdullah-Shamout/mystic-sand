"use client";

import { useTranslations } from "next-intl";
import { Logo } from "@/components/brand/logo";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Branded placeholder for the payment and result pages: shown in the static HTML
 * (Suspense fallback) and until the saved order has loaded from this device.
 */
export function PaymentSkeleton({ variant = "gateway" }: { variant?: "gateway" | "result" }) {
  const t = useTranslations("common");
  return (
    <div aria-busy="true" className="mx-auto w-full max-w-[600px] px-4 py-10 md:py-16">
      <p className="sr-only">{t("loading")}</p>
      <div aria-hidden className="flex justify-center">
        <Logo variant="mark" className="h-12 w-auto animate-pulse text-sand" title="" />
      </div>
      {variant === "gateway" ? (
        <div className="mt-8 border border-line">
          <Skeleton className="h-24 w-full" />
          <div className="space-y-4 p-6 sm:p-8">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-[60px] w-full" />
          </div>
        </div>
      ) : (
        <div className="mt-8 flex flex-col items-center gap-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="mt-6 h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}
    </div>
  );
}
