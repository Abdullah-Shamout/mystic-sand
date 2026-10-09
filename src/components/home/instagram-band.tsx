import { getTranslations } from "next-intl/server";
import { InstagramIcon } from "@/components/brand/brand-icons";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { site } from "@/data/site";

// Clean renders alternating with the darker lifestyle shots.
const TILES = [
  "renders/aura",
  "lifestyle/candles-duo",
  "renders/mist",
  "lifestyle/roses-iii",
  "lifestyle/trio-basket",
  "lifestyle/hourglass-candles",
];

export async function InstagramBand() {
  const t = await getTranslations("home.instagram");
  const handle = `@${site.instagram.handle}`;

  return (
    <section aria-labelledby="instagram-title" className="bg-paper">
      <Reveal className="mx-auto max-w-3xl px-6 pt-20 pb-10 text-center md:pt-24 md:pb-12">
        <h2 id="instagram-title" className="font-serif text-title-sm font-medium md:text-title">
          <bdi dir="ltr">{handle}</bdi>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[15px] text-muted">{t("subtitle")}</p>
      </Reveal>
      {/* Decorative mosaic: plain photos (not links); the button below opens Instagram. */}
      <ul aria-hidden className="grid grid-cols-3 md:grid-cols-6">
        {TILES.map((image) => (
          <li key={image} className="relative aspect-square overflow-hidden bg-tile">
            <ResponsiveImage image={image} alt="" sizes="(min-width: 768px) 17vw, 34vw" />
          </li>
        ))}
      </ul>
      <div className="flex justify-center px-6 py-12 md:py-14">
        <Button asChild variant="secondary">
          <a href={site.instagram.url} target="_blank" rel="noreferrer">
            <InstagramIcon className="size-4" />
            {t("follow")}
            <span className="sr-only">
              {handle} ({t("newTab")})
            </span>
          </a>
        </Button>
      </div>
    </section>
  );
}
