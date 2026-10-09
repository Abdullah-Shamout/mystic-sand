import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuraFeature } from "@/components/home/aura-feature";
import { BrandFilm } from "@/components/home/brand-film";
import { ImagePanel } from "@/components/home/image-panel";
import { InstagramBand } from "@/components/home/instagram-band";
import { NewsletterBand } from "@/components/home/newsletter-band";
import { ServiceStrip } from "@/components/home/service-strip";
import { SignatureDuo } from "@/components/home/signature-duo";
import { VideoHero } from "@/components/home/video-hero";
import { ProductGrid } from "@/components/product/product-grid";
import { SectionTitle } from "@/components/ui/section-title";
import { productBySlug } from "@/data/products";
import { delivery } from "@/data/site";
import type { Product } from "@/data/types";
import type { Locale } from "@/i18n/routing";
import { formatKWD } from "@/lib/money";

type Props = { params: Promise<{ locale: string }> };

const pick = (slugs: string[]) => slugs.map((slug) => productBySlug(slug)).filter((p): p is Product => Boolean(p));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });
  return {
    title: { absolute: t("meta.title") },
    description: t("meta.description", { amount: formatKWD(delivery.standard.freeOverFils, locale as Locale) }),
  };
}

/** Amouage-style home: full-bleed panels and title bands stacked with no gaps. */
export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");

  return (
    <>
      <VideoHero />

      <section>
        <SectionTitle title={t("trilogy.title")} subtitle={t("trilogy.subtitle")} />
        <ProductGrid products={pick(["i", "ii", "iii"])} columns={3} />
      </section>

      <ImagePanel
        image="lifestyle/hourglass-candles"
        mobile="lifestyle/candles-duo"
        alt={t("story.alt")}
        mobileAlt={t("story.altMobile")}
        title={t("story.title")}
        cta={{ href: "/shop/perfumes", label: t("story.cta") }}
        imageClassName="object-[28%_50%]"
        className="h-[75svh] min-h-[480px] md:h-[85svh]"
      />

      <SignatureDuo />
      <AuraFeature />

      <BrandFilm
        id="film-title"
        eyebrow={t("film.eyebrow")}
        title={t("film.title")}
        body={t("film.body")}
        cta={{ href: "/shop", label: t("film.cta") }}
      />

      <section>
        <SectionTitle title={t("homeGrid.title")} subtitle={t("homeGrid.subtitle")} />
        <ProductGrid products={pick(["oasis", "mist", "dune", "oud-chips"])} />
      </section>

      <ServiceStrip />
      <InstagramBand />
      <NewsletterBand />
    </>
  );
}
