import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuraFeature } from "@/components/home/aura-feature";
import { BrandFilm } from "@/components/home/brand-film";
import { HomeProductGrid } from "@/components/home/home-product-grid";
import { InstagramBand } from "@/components/home/instagram-band";
import { ServiceStrip } from "@/components/home/service-strip";
import { SignatureDuo } from "@/components/home/signature-duo";
import { StoryPanel } from "@/components/home/story-panel";
import { VideoHero } from "@/components/home/video-hero";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });
  return {
    title: { absolute: t("meta.title") },
    description: t("meta.description"),
  };
}

/** Amouage-style home: full-bleed panels and title bands stacked with no gaps. Each section reads
 *  its own home-page edits after mount, so the static HTML is unchanged until the admin saves. */
export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <VideoHero />
      <HomeProductGrid section="trilogy" columns={3} />
      <StoryPanel />
      <SignatureDuo />
      <AuraFeature />
      <BrandFilm id="film-title" />
      <HomeProductGrid section="homeGrid" />
      <ServiceStrip />
      <InstagramBand />
    </>
  );
}
