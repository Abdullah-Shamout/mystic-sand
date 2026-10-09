import { site } from "@/data/site";
import type { Product, Variant } from "@/data/types";
import type { Locale } from "@/i18n/routing";
import { imageSource } from "@/lib/media";

const kwd = (fils: number) => (fils / 1000).toFixed(3);

/**
 * schema.org Product for search engines. Image paths come from imageSource(), which
 * runs them through asset() (GitHub Pages base path); they are made absolute when the
 * deploy provides NEXT_PUBLIC_SITE_URL.
 */
export function ProductJsonLd({ product, locale }: { product: Product; locale: Locale }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const origin = siteUrl ? new URL(siteUrl).origin : "";
  const url = siteUrl ? `${siteUrl}/${locale}/product/${product.slug}/` : undefined;
  const prices = product.variants.map((v) => v.priceFils);

  const offer = (v: Variant) => ({
    "@type": "Offer",
    sku: v.sku,
    price: kwd(v.priceFils),
    priceCurrency: site.currency,
    availability: `https://schema.org/${v.stock > 0 ? "InStock" : "OutOfStock"}`,
    itemCondition: "https://schema.org/NewCondition",
    ...(url ? { url } : {}),
  });

  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description[locale],
    image: product.images.gallery.slice(0, 4).map((key) => `${origin}${imageSource(key).src}`),
    sku: product.variants[0].sku,
    category: product.type[locale],
    brand: { "@type": "Brand", name: site.brand },
    offers:
      product.variants.length === 1
        ? offer(product.variants[0])
        : {
            "@type": "AggregateOffer",
            priceCurrency: site.currency,
            lowPrice: kwd(Math.min(...prices)),
            highPrice: kwd(Math.max(...prices)),
            offerCount: product.variants.length,
            offers: product.variants.map(offer),
          },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
