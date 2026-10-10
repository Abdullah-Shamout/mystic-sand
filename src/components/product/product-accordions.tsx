"use client";

import { useLocale, useTranslations } from "next-intl";
import { Accordion, type AccordionItem } from "@/components/ui/accordion";
import type { Product } from "@/data/types";
import type { Locale } from "@/i18n/routing";

/** Description (open) with the "How to use" note, under the buy buttons. */
export function ProductAccordions({ product }: { product: Product }) {
  const t = useTranslations("product");
  const locale = useLocale() as Locale;

  const items: AccordionItem[] = [
    {
      id: "description",
      title: t("accordion.description"),
      content: (
        <div className="space-y-4 text-[15px] leading-[1.8]">
          <p>{product.description[locale]}</p>
          {product.howTo[locale] && (
            <div>
              <h4 className="caps text-[13px] font-medium">{t("accordion.howToUse")}</h4>
              <p className="mt-1 text-muted">{product.howTo[locale]}</p>
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <section className="mt-10">
      <h2 className="sr-only">{t("detailsHeading")}</h2>
      <Accordion items={items} defaultOpen={["description"]} className="border-t border-line" />
    </section>
  );
}
