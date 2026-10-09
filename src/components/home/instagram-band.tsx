import { getTranslations } from "next-intl/server";
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
      {/* Decorative mosaic: plain photos (not links); the handle below opens Instagram. */}
      <ul aria-hidden className="grid grid-cols-3 md:grid-cols-6">
        {TILES.map((image) => (
          <li key={image} className="relative aspect-square overflow-hidden bg-tile">
            <ResponsiveImage image={image} alt="" sizes="(min-width: 768px) 17vw, 34vw" />
          </li>
        ))}
      </ul>
      <Reveal className="mx-auto max-w-3xl px-6 pt-12 pb-16 text-center md:pt-14 md:pb-20">
        <h2 id="instagram-title" className="font-serif text-title-sm font-medium md:text-title">
          <a
            href={site.instagram.url}
            target="_blank"
            rel="noreferrer"
            className="decoration-1 underline-offset-[6px] transition-colors hover:underline"
          >
            <bdi dir="ltr">{handle}</bdi>
            <span className="sr-only"> ({t("newTab")})</span>
          </a>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[15px] text-muted">{t("subtitle")}</p>
      </Reveal>
    </section>
  );
}
