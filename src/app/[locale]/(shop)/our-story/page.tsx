import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { WhatsAppIcon } from "@/components/brand/brand-icons";
import { Logo } from "@/components/brand/logo";
import { richTags } from "@/components/content/rich-tags";
import { StoryChapter } from "@/components/content/story-chapter";
import { BrandFilm } from "@/components/home/brand-film";
import { ImagePanel } from "@/components/home/image-panel";
import { Button } from "@/components/ui/button";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { Reveal } from "@/components/ui/reveal";
import { whatsappLink } from "@/data/site";
import { Link } from "@/i18n/navigation";

type Props = { params: Promise<{ locale: string }> };

const HALF = "(min-width: 768px) 50vw, 100vw";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "content" });
  return { title: t("story.meta.title"), description: t("story.meta.description") };
}

export default async function OurStoryPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("content");
  const film = await getTranslations("home.film");
  const whatsappText = t("story.closing.whatsappMessage");
  const tags = richTags(whatsappText);

  const paragraphs = (chapter: string) =>
    (t.raw(`story.chapters.${chapter}.body`) as string[]).map((_, i) => (
      <p key={i}>{t.rich(`story.chapters.${chapter}.body.${i}`, tags)}</p>
    ));

  return (
    <>
      <ImagePanel
        image="lifestyle/roses-iii"
        alt={t("story.heroAlt")}
        eyebrow={t("story.eyebrow")}
        title={t("story.title")}
        titleAs="h1"
        priority
        imageClassName="object-[24%_50%]"
        className="h-[calc(100svh-105px)] max-h-[960px] min-h-[480px] lg:h-[calc(100svh-177px)]"
      />

      <Reveal className="mx-auto max-w-3xl px-6 py-20 text-center md:py-28">
        <p className="font-serif text-[23px] leading-[1.6] text-ink md:text-[29px]">{t("story.lede")}</p>
      </Reveal>

      <StoryChapter
        id="chapter-kuwait"
        number="01"
        title={t("story.chapters.kuwait.title")}
        mediaClassName="bg-ink"
        media={
          <ResponsiveImage
            image="lifestyle/trio-basket"
            alt={t("story.chapters.kuwait.alt")}
            sizes={HALF}
            className="absolute inset-0"
          />
        }
      >
        {paragraphs("kuwait")}
      </StoryChapter>

      <StoryChapter
        id="chapter-hourglass"
        number="02"
        title={t("story.chapters.hourglass.title")}
        mediaSide="end"
        mediaClassName="bg-sand"
        media={
          <div className="absolute inset-0 flex items-center justify-center">
            <Logo
              variant="mark"
              className="w-[42%] max-w-[280px] text-ink"
              title={t("story.chapters.hourglass.logoLabel")}
            />
          </div>
        }
      >
        {paragraphs("hourglass")}
      </StoryChapter>

      <StoryChapter
        id="chapter-materials"
        number="03"
        title={t("story.chapters.materials.title")}
        mediaClassName="bg-tile"
        media={
          <ResponsiveImage
            image="products/oud-chips/chips"
            alt={t("story.chapters.materials.alt")}
            sizes={HALF}
            fit="contain"
            className="absolute inset-0 p-8 md:p-16"
          />
        }
        footer={
          <Button asChild variant="secondary">
            <Link href="/product/oud-chips">{t("story.chapters.materials.cta")}</Link>
          </Button>
        }
      >
        {paragraphs("materials")}
      </StoryChapter>

      <StoryChapter
        id="chapter-trilogy"
        number="04"
        title={t("story.chapters.trilogy.title")}
        mediaSide="end"
        mediaClassName="bg-ivory"
        media={
          <ResponsiveImage
            image="products/trilogy-set/bottles"
            alt={t("story.chapters.trilogy.alt")}
            sizes={HALF}
            fit="contain"
            className="absolute inset-0 p-8 md:p-14"
          />
        }
        footer={
          <Button asChild>
            <Link href="/shop/eau-de-parfum">{t("story.chapters.trilogy.cta")}</Link>
          </Button>
        }
      >
        {paragraphs("trilogy")}
      </StoryChapter>

      <BrandFilm
        id="story-film-title"
        eyebrow={film("eyebrow")}
        title={film("title")}
        body={film("body")}
        cta={{ href: "/shop/eau-de-parfum", label: t("story.filmCta") }}
      />

      <section aria-labelledby="story-closing" className="px-6 py-20 text-center md:py-28">
        <Reveal className="mx-auto max-w-xl">
          <h2 id="story-closing" className="caps font-serif text-title-sm font-medium md:text-title">
            {t("story.closing.title")}
          </h2>
          <p className="mt-4 text-[16px] text-muted">{t("story.closing.text")}</p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/shop">{t("story.closing.cta")}</Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
              <a href={whatsappLink(whatsappText)} target="_blank" rel="noreferrer">
                <WhatsAppIcon className="size-4" />
                {t("story.closing.secondary")}
                <span className="sr-only">({t("newTab")})</span>
              </a>
            </Button>
          </div>
        </Reveal>
      </section>
    </>
  );
}
