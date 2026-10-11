import { reemKufi } from "@/app/fonts";
import { FeatureSection } from "./feature-section";

/**
 * The featured-product panel (AURA by default). This server shell keeps the decorative Reem Kufi
 * font (next/font) on the server and hands its family name to the client FeatureSection, which
 * picks the live product and texts.
 */
export function AuraFeature() {
  return <FeatureSection signatureFont={reemKufi.style.fontFamily} />;
}
