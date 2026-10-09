import { getTranslations } from "next-intl/server";
import { NewsletterForm } from "@/components/layout/newsletter-form";
import { Reveal } from "@/components/ui/reveal";

/** Amouage's "Insider access" band, on the Instagram sand colour. */
export async function NewsletterBand() {
  const t = await getTranslations("home.newsletter");
  return (
    <section aria-labelledby="newsletter-title" className="bg-sand px-6 py-20 text-ink md:py-24">
      <Reveal className="mx-auto max-w-xl text-center">
        <h2 id="newsletter-title" className="caps font-serif text-title-sm font-medium md:text-title">
          {t("title")}
        </h2>
        <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-ink/80">{t("text")}</p>
        <div className="mx-auto mt-8 max-w-md text-start">
          <NewsletterForm variant="band" />
        </div>
      </Reveal>
    </section>
  );
}
