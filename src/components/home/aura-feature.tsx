import { getLocale, getTranslations } from "next-intl/server";
import { reemKufi } from "@/app/fonts";
import { Button } from "@/components/ui/button";
import { productBySlug } from "@/data/products";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatKWD } from "@/lib/money";
import { AddToBagButton } from "./add-to-bag-button";
import { SplitPanel } from "./split-panel";

const TIERS = ["top", "heart", "base"] as const;

/** AURA on the Instagram sand colour, with its real notes and the Arabic line from the can. */
export async function AuraFeature() {
  const t = await getTranslations("home.aura");
  const locale = (await getLocale()) as Locale;
  const product = productBySlug("aura");
  if (!product) return null;
  const variant = product.variants[0];
  const notes = product.notes;

  return (
    <SplitPanel image="renders/aura" alt={t("alt")} imageSide="end" className="bg-sand text-ink" labelledBy="aura-title">
      <p className="caps text-[12px] md:text-[13px]">{t("eyebrow")}</p>
      <h2 id="aura-title" className="caps mt-3 font-serif text-[52px] leading-none font-medium md:text-[64px]">
        <bdi lang="en">{product.name}</bdi>
      </h2>
      {/* The brand line printed on the can, kept in Arabic in both languages. */}
      <p
        lang="ar"
        dir="rtl"
        className="mt-6 text-[26px] leading-[1.6] md:text-[30px]"
        style={{ fontFamily: reemKufi.style.fontFamily }}
      >
        {t("signature")}
      </p>
      {locale === "en" && <p className="mt-1 text-[14px] text-ink/70">{t("tagline")}</p>}
      <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-ink/85">{t("body")}</p>

      {notes && (
        <dl className="mt-8 grid w-full max-w-md grid-cols-3 divide-x divide-ink/20 border-y border-ink/20 rtl:divide-x-reverse">
          {TIERS.map((tier) => (
            <div key={tier} className="px-2 py-5">
              <dt className="caps text-[11px] text-ink/70 md:text-[12px]">{t(tier)}</dt>
              <dd className="mt-2 text-[14px] leading-snug">
                {notes[tier].map((note) => note[locale]).join(locale === "ar" ? "، " : ", ")}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-8 flex items-baseline gap-3">
        <bdi className="figures text-[19px] font-medium">{formatKWD(variant.priceFils, locale)}</bdi>
        <span className="text-[14px] text-ink/70">
          <bdi>{variant.size[locale]}</bdi>
        </span>
      </p>
      <div className="mt-5 flex w-full max-w-sm flex-col items-center gap-1">
        <AddToBagButton slug={product.slug} />
        <Button asChild variant="link" className="min-h-11 text-[14px]">
          <Link href={`/product/${product.slug}`}>{t("cta")}</Link>
        </Button>
      </div>
    </SplitPanel>
  );
}
