import { getTranslations } from "next-intl/server";
import { Accordion, type AccordionItem } from "@/components/ui/accordion";
import { delivery } from "@/data/site";
import type { Localized, Product } from "@/data/types";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { isolatedKWD } from "@/lib/money";
import { defaultSettings, feeFor } from "@/lib/settings";

const TIERS = ["top", "heart", "base"] as const;

/** Description (open), Notes and Delivery & returns, under the buy buttons. */
export async function ProductAccordions({ product, locale }: { product: Product; locale: Locale }) {
  const t = await getTranslations("product");
  const join = (list: Localized[]) => list.map((note) => note[locale]).join(locale === "ar" ? "، " : ", ");
  const hours = delivery.express.windowMinutes / 60;
  const days = (n: number) => ({ days: n, d: String(n) });
  const link = "inline-flex min-h-11 items-center text-ink underline decoration-1 underline-offset-4 hover:decoration-2";

  const items: AccordionItem[] = [
    {
      id: "description",
      title: t("accordion.description"),
      content: (
        <div className="space-y-4 text-[15px] leading-[1.8]">
          <p>{product.description[locale]}</p>
          <div>
            <h4 className="caps text-[13px] font-medium">
              {product.category === "home" || product.category === "oud" ? t("accordion.howToUse") : t("accordion.howToWear")}
            </h4>
            <p className="mt-1 text-muted">{product.howTo[locale]}</p>
          </div>
        </div>
      ),
    },
  ];

  if (product.notes) {
    const notes = product.notes;
    items.push({
      id: "notes",
      title: t("accordion.notes"),
      content: (
        <dl className="space-y-2.5">
          {TIERS.filter((tier) => notes[tier].length > 0).map((tier) => (
            <div key={tier} className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-4">
              <dt className="caps pt-0.5 text-[13px] text-muted">{t(`notes.${tier}`)}</dt>
              <dd>{join(notes[tier])}</dd>
            </div>
          ))}
        </dl>
      ),
    });
  }

  items.push({
    id: "delivery",
    title: t("accordion.delivery"),
    content: (
      <div className="space-y-4 text-[15px] leading-relaxed">
        <div>
          <h4 className="font-medium">{t("info.standardTitle")}</h4>
          <p className="text-muted">
            {t("info.standard", {
              fee: isolatedKWD(feeFor(defaultSettings, "standard"), locale),
              ...days(delivery.standard.leadDays),
            })}
          </p>
        </div>
        <div>
          <h4 className="font-medium">{t("info.expressTitle", { hours, h: String(hours) })}</h4>
          <p className="text-muted">
            {t("info.express", {
              fee: isolatedKWD(feeFor(defaultSettings, "express"), locale),
              opens: delivery.express.opens,
              friday: delivery.express.fridayOpens,
              last: delivery.express.lastOrder,
            })}
          </p>
        </div>
        <div>
          <h4 className="font-medium">{t("info.returnsTitle")}</h4>
          <p className="text-muted">{t("info.returns", days(delivery.returnsDays))}</p>
        </div>
        <p className="text-muted">{t("info.payment")}</p>
        <p className="flex flex-wrap gap-x-6">
          <Link href="/delivery" className={link}>
            {t("info.deliveryLink")}
          </Link>
          <Link href="/refund-policy" className={link}>
            {t("info.returnsLink")}
          </Link>
        </p>
      </div>
    ),
  });

  return (
    <section className="mt-10">
      <h2 className="sr-only">{t("detailsHeading")}</h2>
      <Accordion items={items} defaultOpen={["description"]} className="border-t border-line" />
    </section>
  );
}
