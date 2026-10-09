"use client";

import { useTranslations } from "next-intl";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** Shown in place of a product page when the product is hidden, deleted or unknown. */
export function ProductUnavailable() {
  const t = useTranslations("product.unavailable");
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-6 pt-16 pb-14 text-center md:pt-24 md:pb-20">
      <div aria-hidden>
        <Logo variant="mark" className="h-14 w-auto" title="" />
      </div>
      <h1 className="caps mt-8 font-serif text-title-sm font-medium md:text-title">{t("title")}</h1>
      <p className="mt-4 max-w-sm text-[16px] text-muted">{t("text")}</p>
      <Button asChild size="lg" className="mt-8">
        <Link href="/shop">{t("cta")}</Link>
      </Button>
    </div>
  );
}
