"use client";

import { useTranslations } from "next-intl";
import { HOME_DEFAULTS, sceneImage } from "@/lib/home";
import { useLiveCatalog, useLiveHome } from "@/lib/live";
import { hasImage } from "@/lib/media";
import { AuraPanel } from "./aura-panel";
import { SplitPanel } from "./split-panel";

/**
 * The featured product on the sand panel. The chosen product (AURA by default) replaces the old
 * CatalogGate: the panel is hidden when that product is missing or hidden. A custom photo wins,
 * else the product's scene render; the AURA alt text shows only for the default AURA photo.
 */
export function FeatureSection({ signatureFont }: { signatureFont: string }) {
  const t = useTranslations("home.aura");
  const o = useLiveHome().feature;
  const catalog = useLiveCatalog();
  const product = catalog.bySlug.get(o?.product ?? HOME_DEFAULTS.feature.product);
  if (!product || product.hidden) return null;

  const customImage = o?.image && hasImage(o.image) ? o.image : undefined;
  const image = customImage ?? sceneImage(product);
  const isDefaultAura = !customImage && product.slug === "aura";

  return (
    <SplitPanel
      image={image}
      alt={isDefaultAura ? t("alt") : ""}
      imageSide="end"
      className="bg-sand text-ink"
      labelledBy="aura-title"
      homeSection="feature"
    >
      <AuraPanel product={product} overrides={o} signatureFont={signatureFont} />
    </SplitPanel>
  );
}
