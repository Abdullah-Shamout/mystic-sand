import { Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { InstagramIcon, WhatsAppIcon } from "@/components/brand/brand-icons";
import { ContactForm, type ContactFormLabels } from "@/components/content/contact-form";
import { linkClass } from "@/components/content/rich-tags";
import { LivePhone, TelAnchor, WhatsAppAnchor } from "@/components/settings/live";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/section-title";
import { site } from "@/data/site";
import { cn } from "@/lib/cn";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "content" });
  return { title: t("contact.meta.title"), description: t("contact.meta.description") };
}

export default async function ContactPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("content");

  const labels: ContactFormLabels = {
    name: t("contact.form.name"),
    phone: t("contact.form.phone"),
    phoneHint: t("contact.form.phoneHint"),
    message: t("contact.form.message"),
    messageHint: t("contact.form.messageHint"),
    submit: t("contact.form.submit"),
    errorSummary: t("contact.form.errorSummary"),
    errors: {
      nameRequired: t("contact.form.errors.nameRequired"),
      phoneRequired: t("contact.form.errors.phoneRequired"),
      phoneInvalid: t("contact.form.errors.phoneInvalid"),
      phoneLandline: t("contact.form.errors.phoneLandline"),
      messageRequired: t("contact.form.errors.messageRequired"),
      messageShort: t("contact.form.errors.messageShort"),
      tooLong: t("contact.form.errors.tooLong"),
    },
    successTitle: t("contact.form.successTitle"),
    successText: t("contact.form.successText"),
    successAnnounce: t("contact.form.successAnnounce"),
    whatsappCta: t("contact.form.whatsappCta"),
    whatsappGreeting: t("contact.form.whatsappGreeting"),
    another: t("contact.form.another"),
    newTab: t("newTab"),
  };

  type Channel = { icon: ReactNode; label: string; value?: string; href?: string; external?: boolean; tel?: boolean };
  const channels: Channel[] = [
    {
      icon: <InstagramIcon className="size-[18px]" />,
      label: t("contact.channels.instagram"),
      value: `@${site.instagram.handle}`,
      href: site.instagram.url,
      external: true,
    },
    {
      icon: <Phone className="size-[18px]" strokeWidth={1.25} aria-hidden />,
      label: t("contact.channels.phone"),
      tel: true,
    },
    {
      icon: <Mail className="size-[18px]" strokeWidth={1.25} aria-hidden />,
      label: t("contact.channels.email"),
      value: site.email,
      href: `mailto:${site.email}`,
    },
  ];

  const hours = [
    { days: t("contact.hours.satThu"), time: t("contact.hours.satThuTime") },
    { days: t("contact.hours.fri"), time: t("contact.hours.friTime") },
  ];

  return (
    <>
      <SectionTitle as="h1" title={t("contact.title")} subtitle={t("contact.subtitle")} />

      <div className="mx-auto grid max-w-[1200px] gap-14 px-6 pb-24 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-20">
        <div className="space-y-12">
          <section aria-labelledby="contact-whatsapp" className="bg-tile px-6 py-8 md:px-10 md:py-10">
            <WhatsAppIcon className="size-8 text-racing" />
            <h2 id="contact-whatsapp" className="caps mt-5 font-serif text-title-sm font-medium">
              {t("contact.whatsapp.title")}
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-ink/80">{t("contact.whatsapp.text")}</p>
            <Button asChild size="lg" block className="mt-7">
              <WhatsAppAnchor text={t("contact.whatsapp.message")} target="_blank" rel="noreferrer">
                <WhatsAppIcon className="size-[18px]" />
                {t("contact.whatsapp.cta")}
                <span className="sr-only">({t("newTab")})</span>
              </WhatsAppAnchor>
            </Button>
          </section>

          <section aria-labelledby="contact-channels">
            <h2 id="contact-channels" className="caps text-[14px] font-medium">
              {t("contact.channels.title")}
            </h2>
            <dl className="mt-4 divide-y divide-line border-y border-line">
              {channels.map((c) => (
                <div key={c.label} className="flex flex-wrap items-center justify-between gap-x-6 py-2">
                  <dt className="flex items-center gap-3 text-[15px]">
                    {c.icon}
                    {c.label}
                  </dt>
                  <dd>
                    {c.tel ? (
                      <TelAnchor dir="ltr" className={cn(linkClass, "inline-flex min-h-11 items-center text-[15px]")}>
                        <LivePhone />
                      </TelAnchor>
                    ) : (
                      <a
                        href={c.href}
                        {...(c.external ? { target: "_blank", rel: "noreferrer" } : {})}
                        className={cn(linkClass, "inline-flex min-h-11 items-center text-[15px]")}
                      >
                        <bdi dir="ltr">{c.value}</bdi>
                        {c.external && <span className="sr-only"> ({t("newTab")})</span>}
                      </a>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="contact-hours">
            <h2 id="contact-hours" className="caps text-[14px] font-medium">
              {t("contact.hours.title")}
            </h2>
            <dl className="mt-4 space-y-2 text-[15px]">
              {hours.map((h) => (
                <div key={h.days} className="flex justify-between gap-6">
                  <dt>{h.days}</dt>
                  <dd className="figures text-ink/80">{h.time}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[13px] text-muted">{t("contact.hours.note")}</p>
          </section>
        </div>

        <section aria-labelledby="contact-form-title" className="border border-line px-6 py-8 md:px-10 md:py-10 lg:self-start">
          <h2 id="contact-form-title" className="caps font-serif text-title-sm font-medium">
            {t("contact.form.title")}
          </h2>
          <p className="mt-3 mb-8 text-[15px] leading-relaxed text-ink/80">{t("contact.form.intro")}</p>
          <ContactForm labels={labels} />
        </section>
      </div>
    </>
  );
}
