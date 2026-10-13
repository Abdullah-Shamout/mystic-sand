"use client";

import { RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { WhatsAppIcon } from "@/components/brand/brand-icons";
import { formatDays, standardWhen } from "@/components/content/values";
import { WhatsAppAnchor } from "@/components/settings/live";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { delivery } from "@/data/site";
import type { Locale } from "@/i18n/routing";
import { fillTokens, SERVICE_KEYS, textOr } from "@/lib/home";
import { useLiveHome, useLiveSettings } from "@/lib/live";
import { isolatedKWD } from "@/lib/money";
import { feeFor } from "@/lib/settings";

const ICONS = [Truck, RotateCcw, ShieldCheck];

/** Reassurance strip on racing green, ending with the WhatsApp concierge. */
export function ServiceStrip() {
  const t = useTranslations("home.services");
  const locale = useLocale() as Locale;
  const settings = useLiveSettings();
  const o = useLiveHome().services;

  // The live store facts the service tokens expand to. Admin text goes through fillTokens; the
  // built-in messages go through ICU t() with the same values.
  const values = {
    fee: isolatedKWD(feeFor(settings), locale),
    when: standardWhen(locale),
    window: formatDays(delivery.returnsDays, locale),
  };

  const items = SERVICE_KEYS.map((key, i) => {
    const override = o?.items?.[i];
    const overrideText = override?.text?.[locale];
    return {
      key,
      icon: ICONS[i],
      title: textOr(override?.title, locale, t(`${key}.title`)),
      text: overrideText !== undefined ? fillTokens(overrideText, values) : t(`${key}.text`, values),
    };
  });

  return (
    <section aria-labelledby="services-title" data-home-section="services" className="bg-racing text-cream [&_:focus-visible]:outline-cream">
      <h2 id="services-title" className="sr-only">
        {t("title")}
      </h2>
      <ul className="mx-auto grid max-w-[1200px] grid-cols-1 gap-x-6 gap-y-12 px-6 py-16 sm:grid-cols-3 md:py-20">
        {items.map(({ key, icon: Icon, title, text }, i) => (
          <Reveal as="li" key={key} index={i} className="flex flex-col items-center text-center">
            <Icon className="size-7" strokeWidth={1} aria-hidden />
            <h3 className="caps mt-5 text-[13px] leading-snug [overflow-wrap:anywhere] md:text-[14px]">{title}</h3>
            <p className="mt-2 max-w-[28ch] text-[13px] leading-relaxed text-cream/75 [overflow-wrap:anywhere] md:text-[14px]">{text}</p>
          </Reveal>
        ))}
      </ul>
      <div className="border-t border-cream/20">
        <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-6 px-6 py-10 text-center md:flex-row md:justify-center md:gap-10">
          <p className="font-serif text-[22px] leading-snug [overflow-wrap:anywhere] md:text-[24px]">{textOr(o?.whatsappText, locale, t("whatsapp.text"))}</p>
          <Button asChild variant="outline-light">
            <WhatsAppAnchor text={textOr(o?.whatsappMessage, locale, t("whatsapp.message"))} target="_blank" rel="noreferrer">
              <WhatsAppIcon className="size-[18px]" />
              {textOr(o?.whatsappCta, locale, t("whatsapp.cta"))}
              <span className="sr-only">({t("newTab")})</span>
            </WhatsAppAnchor>
          </Button>
        </div>
      </div>
    </section>
  );
}
