import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { WhatsAppIcon } from "@/components/brand/brand-icons";
import { FaqGroup } from "@/components/content/faq-group";
import { richTags } from "@/components/content/rich-tags";
import { storeValues } from "@/components/content/values";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/section-title";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { defaultSettings, whatsappHref } from "@/lib/settings";

type Props = { params: Promise<{ locale: string }> };

// Shape of messages/*/content.json → faq.groups (ids double as anchors: /faq#payment).
type FaqItem = { q: string; a: string; list?: string[] };
type FaqTopic = { title: string; items: Record<string, FaqItem> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "content" });
  return { title: t("faq.meta.title"), description: t("faq.meta.description") };
}

export default async function FaqPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("content");
  const topics = Object.entries(t.raw("faq.groups") as Record<string, FaqTopic>);
  const whatsappText = t("faq.whatsappMessage");
  const values = { ...storeValues(locale as Locale), ...richTags(whatsappText) };

  return (
    <>
      <SectionTitle as="h1" title={t("faq.title")} subtitle={t("faq.subtitle")} />

      <nav aria-label={t("faq.topics")} className="mx-auto max-w-3xl px-6">
        <ul className="flex flex-wrap justify-center gap-2">
          {topics.map(([id]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="inline-flex min-h-11 items-center border border-ink/20 px-4 text-[14px] transition-colors hover:border-ink hover:bg-ink hover:text-paper"
              >
                {t(`faq.groups.${id}.title`)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mx-auto max-w-3xl px-6 pb-24">
        {topics.map(([id, topic]) => (
          <section key={id} id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 pt-14 md:pt-16 lg:scroll-mt-28">
            <h2 id={`${id}-title`} className="caps mb-2 font-serif text-title-sm font-medium">
              {t(`faq.groups.${id}.title`)}
            </h2>
            <FaqGroup
              id={id}
              items={Object.entries(topic.items).map(([itemId, item]) => {
                const key = `faq.groups.${id}.items.${itemId}`;
                return {
                  id: `${id}-${itemId}`,
                  title: (
                    <span className="block py-0.5 text-[16px] leading-snug tracking-normal normal-case">{t(`${key}.q`)}</span>
                  ),
                  content: (
                    <div className="space-y-3 pe-8 text-[15px] leading-[1.8] text-ink/85">
                      <p>{t.rich(`${key}.a`, values)}</p>
                      {item.list && (
                        <ol className="list-decimal space-y-1.5 ps-5 marker:text-muted">
                          {item.list.map((_, j) => (
                            <li key={j} className="ps-1">
                              {t.rich(`${key}.list.${j}`, values)}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  ),
                };
              })}
            />
          </section>
        ))}

        <section aria-labelledby="faq-more" className="mt-20 bg-tile px-6 py-10 text-center md:px-10 md:py-12">
          <h2 id="faq-more" className="caps font-serif text-title-sm font-medium">
            {t("faq.more.title")}
          </h2>
          <p className="mt-3 text-[15px] text-ink/80">{t("faq.more.text")}</p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild className="w-full sm:w-auto">
              <a href={whatsappHref(defaultSettings, whatsappText)} target="_blank" rel="noreferrer">
                <WhatsAppIcon className="size-4" />
                {t("faq.more.whatsapp")}
                <span className="sr-only">({t("newTab")})</span>
              </a>
            </Button>
            <Button asChild variant="secondary" className="w-full sm:w-auto">
              <Link href="/contact">{t("faq.more.contact")}</Link>
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}
