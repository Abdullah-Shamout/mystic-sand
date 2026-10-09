import { getTranslations } from "next-intl/server";
import { reemKufi } from "@/app/fonts";
import { CatalogGate } from "@/components/product/catalog-gate";
import { AuraPanel } from "./aura-panel";
import { SplitPanel } from "./split-panel";

/**
 * AURA on the Instagram sand colour, with its real notes and the Arabic line from the can.
 * The decorative Reem Kufi font (next/font) stays server-side; the product-dependent content
 * lives in the client AuraPanel, shown only while AURA is visible in the live catalog.
 */
export async function AuraFeature() {
  const t = await getTranslations("home.aura");

  return (
    <CatalogGate slug="aura">
      <SplitPanel image="renders/aura" alt={t("alt")} imageSide="end" className="bg-sand text-ink" labelledBy="aura-title">
        <AuraPanel signatureFont={reemKufi.style.fontFamily} />
      </SplitPanel>
    </CatalogGate>
  );
}
