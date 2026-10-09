import { Clock, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { WhatsAppIcon } from "@/components/brand/brand-icons";
import { expressWindow, formatDays, ltr } from "@/components/content/values";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { delivery, whatsappLink } from "@/data/site";
import type { Locale } from "@/i18n/routing";
import { isolatedKWD } from "@/lib/money";

/** Reassurance strip on racing green, ending with the WhatsApp concierge. */
export async function ServiceStrip() {
  const t = await getTranslations("home.services");
  const locale = (await getLocale()) as Locale;

  const items = [
    {
      icon: Truck,
      title: t("delivery.title", { amount: isolatedKWD(delivery.standard.freeOverFils, locale) }),
      text: t("delivery.text"),
    },
    {
      icon: Clock,
      title: t("express.title", { window: expressWindow(locale) }),
      text: t("express.text", { lastOrder: ltr(delivery.express.lastOrder) }),
    },
    { icon: RotateCcw, title: t("returns.title"), text: t("returns.text", { window: formatDays(delivery.returnsDays, locale) }) },
    { icon: ShieldCheck, title: t("payment.title"), text: t("payment.text") },
  ];

  return (
    <section aria-labelledby="services-title" className="bg-racing text-cream [&_:focus-visible]:outline-cream">
      <h2 id="services-title" className="sr-only">
        {t("title")}
      </h2>
      <ul className="mx-auto grid max-w-[1440px] grid-cols-2 gap-x-6 gap-y-12 px-6 py-16 md:py-20 lg:grid-cols-4">
        {items.map(({ icon: Icon, title, text }, i) => (
          <Reveal as="li" key={title} index={i} className="flex flex-col items-center text-center">
            <Icon className="size-7" strokeWidth={1} aria-hidden />
            <h3 className="caps mt-5 text-[13px] leading-snug md:text-[14px]">{title}</h3>
            <p className="mt-2 max-w-[28ch] text-[13px] leading-relaxed text-cream/75 md:text-[14px]">{text}</p>
          </Reveal>
        ))}
      </ul>
      <div className="border-t border-cream/20">
        <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-6 px-6 py-10 text-center md:flex-row md:justify-center md:gap-10">
          <p className="font-serif text-[22px] leading-snug md:text-[24px]">{t("whatsapp.text")}</p>
          <Button asChild variant="outline-light">
            <a href={whatsappLink(t("whatsapp.message"))} target="_blank" rel="noreferrer">
              <WhatsAppIcon className="size-[18px]" />
              {t("whatsapp.cta")}
              <span className="sr-only">({t("newTab")})</span>
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
