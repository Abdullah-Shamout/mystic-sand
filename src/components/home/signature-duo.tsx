import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { productBySlug } from "@/data/products";
import type { Product } from "@/data/types";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

/** CAFÉ and OUD: two equal full-height halves on desktop, stacked on phones. */
export async function SignatureDuo() {
  const t = await getTranslations("home.duo");
  const locale = (await getLocale()) as Locale;
  const items = ["cafe", "oud"].map((slug) => productBySlug(slug)).filter((p): p is Product => Boolean(p));

  return (
    <section className="grid md:grid-cols-2 [&_:focus-visible]:outline-cream">
      {items.map((product, i) => (
        <Link
          key={product.slug}
          href={`/product/${product.slug}`}
          className="group relative block aspect-[3/5] overflow-hidden bg-tile text-cream sm:aspect-[4/5] lg:aspect-auto lg:h-[calc(100svh-129px)] lg:min-h-[600px]"
        >
          <ResponsiveImage
            image={`renders/${product.slug}`}
            alt={t("alt", { name: product.name })}
            sizes="(min-width: 768px) 50vw, 100vw"
            className="absolute inset-0 transition-transform duration-500 ease-[var(--ease-soft)] group-hover:scale-[1.03]"
          />
          {/* Deeper scrim: the stone faces in these renders are light, so cream type needs the extra contrast. */}
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-[62%] bg-linear-to-t from-ink/80 via-ink/40 to-transparent" />
          <Reveal index={i} className="absolute inset-x-0 bottom-0 flex flex-col items-center px-6 pb-10 text-center md:pb-12 lg:pb-14">
            <p className="text-[13px] text-cream/85">
              {product.type[locale]} · <bdi className="whitespace-nowrap">{product.variants[0].size[locale]}</bdi>
            </p>
            <h2 className="caps mt-1 font-serif text-[34px] leading-none font-medium md:text-[42px]">
              <bdi lang="en">{product.name}</bdi>
            </h2>
            <p className="mt-3 max-w-xs text-[15px] leading-snug text-cream/90">{product.tagline[locale]}</p>
            <Button asChild variant="light" size="sm" className="mt-5 min-w-36 group-hover:border-ink group-hover:bg-ink group-hover:text-paper">
              <span>{t("cta")}</span>
            </Button>
          </Reveal>
        </Link>
      ))}
    </section>
  );
}
