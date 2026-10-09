"use client";

import { useTranslations } from "next-intl";
import { Logo } from "@/components/brand/logo";
import { ProductGrid } from "@/components/product/product-grid";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { productBySlug } from "@/data/products";
import type { Product } from "@/data/types";
import { Link } from "@/i18n/navigation";
import { useCheckout } from "@/store/checkout";
import { iso } from "./form-helpers";

const TRILOGY = ["i", "ii", "iii"].map(productBySlug).filter(Boolean) as Product[];

/** Same frame as the form, so nothing jumps when the saved bag loads. */
export function CheckoutSkeleton() {
  const t = useTranslations("checkout");
  return (
    <div aria-busy>
      <div className="h-14 border-b border-line bg-tile lg:hidden" />
      <div className="mx-auto max-w-[1200px] px-4 pt-8 pb-24 md:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16 lg:pt-14 xl:grid-cols-[minmax(0,1fr)_440px] xl:gap-24">
        <div className="min-w-0">
          <h1 className="caps font-serif text-title-sm font-medium md:text-title">{t("title")}</h1>
          <p className="sr-only">{t("loading")}</p>
          <Skeleton className="mt-8 h-[52px] w-full" />
          <div className="mt-14 space-y-5 border-t border-line pt-8">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-12 w-full" />
            <div className="grid gap-5 sm:grid-cols-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
          <div className="mt-12 space-y-5 border-t border-line pt-8">
            <Skeleton className="h-7 w-52" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
        <Skeleton className="hidden h-[460px] w-full lg:block" />
      </div>
    </div>
  );
}

/** Empty bag on /checkout: an inline invitation (never a redirect), plus the last order if any. */
export function CheckoutEmpty() {
  const t = useTranslations("checkout.empty");
  const lastOrderId = useCheckout((s) => (s.lastOrderId && s.orders[s.lastOrderId] ? s.lastOrderId : null));

  return (
    <div>
      <div className="mx-auto flex max-w-xl flex-col items-center px-6 pt-16 pb-14 text-center md:pt-24 md:pb-20">
        <div aria-hidden>
          <Logo variant="mark" className="h-14 w-auto" title="" />
        </div>
        <h1 className="caps mt-8 font-serif text-title-sm font-medium md:text-title">{t("title")}</h1>
        <p className="mt-4 max-w-sm text-[16px] text-muted">{t("text")}</p>
        <div className="mt-8 flex flex-col items-center gap-4">
          <Button asChild size="lg">
            <Link href="/shop/perfumes">{t("cta")}</Link>
          </Button>
          {lastOrderId && (
            <Button asChild variant="link" className="text-[14px]">
              <Link href={`/checkout/result?order=${encodeURIComponent(lastOrderId)}`}>
                {t("lastOrder", { id: iso(lastOrderId) })}
              </Link>
            </Button>
          )}
        </div>
      </div>
      <ProductGrid products={TRILOGY} columns={3} />
    </div>
  );
}
